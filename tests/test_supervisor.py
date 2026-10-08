"""Process ownership, restarts and cleanup checks with fake children."""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
import watchdog


class FakeProcess:
    def __init__(self,pid=101,stubborn=False):
        self.pid,self.stubborn,self.exit_code = pid,stubborn,None
        self.terminated,self.killed,self.waits = False,False,[]
    def poll(self):
        return self.exit_code
    def terminate(self):
        self.terminated = True
        if not self.stubborn:
            self.exit_code = 0
    def kill(self):
        self.killed,self.exit_code = True,-9
    def wait(self,timeout=None):
        self.waits.append(timeout)
        if self.stubborn and not self.killed:
            raise subprocess.TimeoutExpired("fake",timeout)
        if self.exit_code is None:
            self.exit_code = 0
        return self.exit_code


class StopAfterWait:
    def __init__(self):
        self.stopped = False
    def is_set(self):
        return self.stopped
    def set(self):
        self.stopped = True
    def wait(self,_timeout):
        self.stopped = True
        return True


class SupervisorTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        (self.root/"teams").mkdir()
        for name in ("service.py","other.py","watchdog.py","teams/aapl_team.py","teams/orchestrator.py"):
            (self.root/name).write_text("pass\n",encoding="utf-8")
        self.status = Mock()
        self.patch_status = patch("watchdog.upsert_process_status",self.status)
        self.patch_schema = patch("watchdog.ensure_system_tables")
        self.patch_status.start()
        self.schema = self.patch_schema.start()
        self.addCleanup(self.patch_status.stop)
        self.addCleanup(self.patch_schema.stop)

    def supervisor(self,targets=None,**kwargs):
        return watchdog.Supervisor(targets=targets or ["service.py"],root_dir=self.root,
                                   log_dir=self.root/"logs",**kwargs)

    def test_invalid_recursive_duplicate_missing_and_outside_services(self):
        for targets in (["watchdog.py"],["teams/orchestrator.py"],
                        ["service.py","./service.py"],["missing.py"],["../service.py"],
                        [str(self.root/"service.py")]):
            with self.subTest(targets=targets),self.assertRaises(ValueError):
                self.supervisor(targets)
        with self.assertRaises(ValueError):
            watchdog.Supervisor(targets=[],root_dir=self.root,log_dir=self.root/"logs")

    def test_commands_use_same_interpreter_root_and_separate_logs(self):
        owner = self.supervisor(["service.py","teams/aapl_team.py"])
        with patch("watchdog.subprocess.Popen",side_effect=[FakeProcess(10),FakeProcess(11)]) as popen:
            try:
                for child in owner.children:
                    owner.start(child)
                owner.tick(0)
                self.assertEqual(popen.call_args_list[0].args[0],
                                 [sys.executable,"-u",str(self.root/"service.py")])
                self.assertEqual(popen.call_args_list[1].args[0],
                                 [sys.executable,"-u","-m","teams.aapl_team"])
                for call in popen.call_args_list:
                    self.assertEqual(call.kwargs["cwd"],str(self.root))
                    self.assertEqual(call.kwargs["stdin"],subprocess.DEVNULL)
                    self.assertEqual(call.kwargs["stderr"],subprocess.STDOUT)
                    self.assertTrue(call.kwargs["env"]["PYTHONPATH"].startswith(str(self.root)))
                self.assertIsNot(owner.children[0].log,owner.children[1].log)
                self.assertEqual([c.reported_status for c in owner.children],["RUNNING","RUNNING"])
            finally:
                owner.shutdown()

    def test_only_failed_child_restarts_with_bounded_budget(self):
        first,sibling,replacement = FakeProcess(10),FakeProcess(11),FakeProcess(12)
        owner = self.supervisor(["service.py","other.py"],max_restarts=1)
        with patch("watchdog.subprocess.Popen",side_effect=[first,sibling,replacement]) as popen:
            try:
                for child in owner.children:
                    owner.start(child)
                first.exit_code = 7
                owner.tick(10)
                self.assertEqual(owner.children[0].next_start,11)
                self.assertIsNone(owner.children[0].pid)
                owner.tick(10.5)
                self.assertEqual(popen.call_count,2)
                owner.tick(11)
                self.assertEqual(popen.call_count,3)
                self.assertIs(owner.children[1].process,sibling)
                self.assertEqual(owner.children[0].restarts,1)
                replacement.exit_code = 9
                owner.tick(12)
                owner.tick(1000)
                self.assertTrue(owner.children[0].exhausted)
                self.assertEqual(owner.children[0].reported_status,"FAILED")
                self.assertIsNone(owner.children[0].pid)
            finally:
                owner.shutdown()

    def test_launch_failure_exhausts_budget_and_closes_log(self):
        owner = self.supervisor(max_restarts=1)
        child = owner.children[0]
        child.next_start = 0
        with patch("watchdog.subprocess.Popen",side_effect=OSError("no process")) as popen:
            owner.tick(0)
            owner.tick(1000)
        self.assertEqual(popen.call_count,1)
        self.assertTrue(child.exhausted)
        self.assertIsNone(child.log)
        self.assertEqual(child.reported_status,"FAILED")

    def test_partial_startup_cleans_owned_child_and_records_failed_target(self):
        first = FakeProcess(10)
        owner = self.supervisor(["service.py","other.py"])
        with patch("watchdog.subprocess.Popen",side_effect=[first,OSError("no process")]):
            with self.assertRaises(OSError):
                owner.run()
        self.assertTrue(first.terminated)
        self.assertTrue(first.waits)
        self.assertTrue(all(child.log is None for child in owner.children))
        self.assertTrue(all(child.process is None for child in owner.children))
        self.assertEqual(owner.children[1].reported_status,"FAILED")
        self.schema.assert_called_once()

    def test_forced_shutdown_waits_and_is_idempotent(self):
        process = FakeProcess(stubborn=True)
        owner = self.supervisor()
        with patch("watchdog.subprocess.Popen",return_value=process):
            owner.start(owner.children[0])
        self.assertTrue(owner.shutdown())
        self.assertTrue(process.terminated)
        self.assertTrue(process.killed)
        self.assertEqual(len(process.waits),2)
        self.assertIsNone(owner.children[0].log)
        self.assertTrue(owner.shutdown())
        self.assertEqual(len(process.waits),2)

    def test_write_failure_retries_and_never_loses_ownership(self):
        process = FakeProcess()
        owner = self.supervisor()
        with patch("watchdog.subprocess.Popen",return_value=process):
            owner.start(owner.children[0])
        self.status.side_effect = OSError("locked")
        owner.tick(0)
        self.assertEqual(owner.children[0].reported_status,"STARTING")
        self.status.side_effect = None
        owner.tick(1)
        self.assertEqual(owner.children[0].reported_status,"RUNNING")
        owner.shutdown()
        self.assertTrue(process.terminated)

    def test_cleanup_failure_preserves_handle_and_returns_failure(self):
        process = FakeProcess(stubborn=True)
        process.kill = Mock(side_effect=OSError("denied"))
        owner = self.supervisor(stop_event=StopAfterWait())
        with patch("watchdog.subprocess.Popen",return_value=process):
            self.assertEqual(owner.run(),1)
        self.assertIs(owner.children[0].process,process)
        self.assertEqual(owner.children[0].reported_status,"SHUTDOWN_FAILED")
        process.kill = lambda: setattr(process,"exit_code",-9)
        process.stubborn = False
        self.assertTrue(owner.shutdown())

    def test_singleton_rejection_does_not_spawn(self):
        with patch("watchdog.InstanceLock.__enter__",side_effect=watchdog.AlreadyRunningError("already")), \
             patch("watchdog.Supervisor") as constructor:
            self.assertEqual(watchdog.run_supervisor(),1)
        constructor.assert_not_called()

    def test_real_os_lock_excludes_second_owner_and_can_be_reacquired(self):
        path = self.root/"runtime.lock"
        with watchdog.InstanceLock(path):
            second = watchdog.InstanceLock(path)
            with self.assertRaises(watchdog.AlreadyRunningError):
                second.__enter__()
            self.assertIsNone(second.file)
        with watchdog.InstanceLock(path):
            self.assertTrue(path.exists())

    def test_interrupt_cleans_children(self):
        process = FakeProcess()
        owner = self.supervisor()
        with patch("watchdog.subprocess.Popen",return_value=process), \
             patch.object(owner,"tick",side_effect=KeyboardInterrupt):
            self.assertEqual(owner.run(),130)
        self.assertTrue(process.terminated)
        self.assertIsNone(owner.children[0].log)


if __name__ == "__main__":
    unittest.main()
