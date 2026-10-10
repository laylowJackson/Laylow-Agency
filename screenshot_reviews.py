"""Private local review files, immutable extraction, editable corrections, SQLite links."""
import json
import math
import uuid
from pathlib import Path
from io import BytesIO
from db_utils import connect_db, utc_now
from screenshot_analysis import extraction_layer, strategy_layer

MAX_FILE = 8 * 1024 * 1024
ROLES = {"entry", "context", "additional"}
STATUSES = {"pending_review", "analyzed", "corrected", "approved", "exported"}


def ensure_reviews(database):
    with connect_db(database) as c:
        c.execute("""CREATE TABLE IF NOT EXISTS screenshot_reviews (
            id TEXT PRIMARY KEY, trade_id TEXT, trade_source TEXT, trade_mode TEXT,
            symbol TEXT, team_name TEXT, strategy TEXT, instrument TEXT, entry_timeframe TEXT,
            direction TEXT, entry_value REAL, stop_value REAL, target_value REAL, reward_risk REAL,
            outcome TEXT NOT NULL, extraction_confidence REAL NOT NULL,
            raw_extraction_json TEXT NOT NULL, corrected_values_json TEXT NOT NULL,
            analysis_notes TEXT, screenshot_path TEXT, context_screenshot_path TEXT,
            annotated_screenshot_path TEXT, review_status TEXT NOT NULL,
            record_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)""")
        c.execute("CREATE INDEX IF NOT EXISTS idx_screenshot_trade ON screenshot_reviews(trade_source,trade_mode,trade_id)")


def text(value, limit=5000):
    if value is None or value == "":
        return None
    if not isinstance(value, str) or len(value) > limit:
        raise ValueError("Invalid text")
    return value


def corrections(value):
    if not isinstance(value, dict):
        raise ValueError("Expected corrected values")
    out = {k: text(value.get(k), 128 if k != "notes" else 5000) for k in
           ("instrument", "entry_timeframe", "higher_timeframe", "strategy", "notes", "invalidation")}
    out["direction"] = value.get("direction") or None
    if out["direction"] not in {None, "LONG", "SHORT"}:
        raise ValueError("Invalid direction")
    for name in ("entry_value", "stop_value", "target_value"):
        v = value.get(name)
        if v is not None and (isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not 0 < v < 1e12):
            raise ValueError("Invalid trade price")
        out[name] = v
    targets = value.get("targets", [])
    if not isinstance(targets, list) or len(targets) > 10 or any(not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v) or not 0 < v < 1e12 for v in targets):
        raise ValueError("Invalid targets")
    out["targets"] = targets
    out["outcome"] = value.get("outcome", "unknown")
    if out["outcome"] not in {"win", "loss", "open", "unknown"}:
        raise ValueError("Invalid outcome")
    out["outcome_evidence"] = text(value.get("outcome_evidence"), 2000)
    if out["outcome"] != "unknown" and not out["outcome_evidence"]:
        raise ValueError("An outcome needs supporting evidence")
    out["values_verified"] = value.get("values_verified") is True
    conditions = value.get("conditions", [])
    if not isinstance(conditions, list) or len(conditions) > 30:
        raise ValueError("Invalid conditions")
    out["conditions"] = []
    for item in conditions:
        if not isinstance(item, dict) or item.get("timing") not in {"pre_entry", "post_entry", "unknown"}:
            raise ValueError("Invalid condition timing")
        label = text(item.get("label"), 120)
        if not label or not label.strip():
            raise ValueError("Condition needs a label")
        out["conditions"].append({"label": label, "timing": item["timing"], "origin": "user"})
    return out


def annotations(items):
    if not isinstance(items, list) or len(items) > 30:
        raise ValueError("Too many annotations")
    out = []
    for a in items:
        if not isinstance(a, dict) or a.get("type") not in {"entry", "stop", "target", "supply", "demand", "structure", "arrow", "label", "cutoff"} or a.get("role") not in ROLES:
            raise ValueError("Invalid annotation")
        clean = {"type": a["type"], "role": a["role"], "label": text(a.get("label"), 120), "origin": "user", "estimated": True}
        for k in ("x", "y", "x2", "y2"):
            v = a.get(k)
            if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not 0 <= v <= 1:
                raise ValueError("Invalid annotation coordinates")
            clean[k] = v
        out.append(clean)
    return out


class ReviewStore:
    def __init__(self, database, directory):
        self.database, self.directory = database, Path(directory).resolve()
        ensure_reviews(database)

    def list(self):
        with connect_db(self.database) as c:
            return [json.loads(r["record_json"]) for r in c.execute("SELECT record_json FROM screenshot_reviews ORDER BY updated_at DESC LIMIT 300")]

    def get(self, review_id):
        with connect_db(self.database) as c:
            row = c.execute("SELECT record_json FROM screenshot_reviews WHERE id=?", (review_id,)).fetchone()
        if not row:
            raise KeyError(review_id)
        return json.loads(row[0])

    def upload(self, stream, role):
        if role not in ROLES:
            raise ValueError("Invalid screenshot role")
        data = stream.read(MAX_FILE + 1)
        if not data or len(data) > MAX_FILE:
            raise ValueError("Use an image up to 8 MB")
        from PIL import Image, ImageOps, UnidentifiedImageError
        try:
            with Image.open(BytesIO(data)) as source:
                if source.format not in {"PNG", "JPEG", "WEBP"} or source.width * source.height > 30_000_000:
                    raise ValueError("Use PNG, JPG or WEBP up to 30 million pixels")
                source.verify()
            with Image.open(BytesIO(data)) as source:
                image = ImageOps.exif_transpose(source).convert("RGB")
                width, height = image.size
                name = uuid.uuid4().hex + ".png"
                original = self.directory / "originals" / name
                original.parent.mkdir(parents=True, exist_ok=True)
                # Re-encoded original-resolution upload strips private EXIF and unsafe payloads.
                image.save(original, "PNG")
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as e:
            raise ValueError("Image could not be decoded") from e
        return {"id": name, "role": role, "width": width, "height": height,
                "path": "originals/" + name, "url": "/api/reviews/files/originals/" + name}

    def valid_images(self, items):
        if not isinstance(items, list) or not 1 <= len(items) <= 3:
            raise ValueError("Upload one entry image and at most two context images")
        clean, roles = [], set()
        for item in items:
            if not isinstance(item, dict) or item.get("role") not in ROLES or item["role"] in roles:
                raise ValueError("Invalid screenshot roles")
            name = item.get("id", "")
            if not isinstance(name, str) or len(name) != 36 or not name.endswith(".png"):
                raise ValueError("Invalid image ID")
            try:
                uuid.UUID(hex=name[:-4])
            except ValueError:
                raise ValueError("Invalid image ID") from None
            path = self.directory / "originals" / name
            if not path.is_file():
                raise ValueError("Screenshot is missing")
            from PIL import Image
            with Image.open(path) as image:
                clean.append({"id": name, "role": item["role"], "width": image.width, "height": image.height,
                              "name": text(item.get("name"), 180) or item["role"]+" screenshot",
                              "path": "originals/"+name, "url": "/api/reviews/files/originals/"+name})
            roles.add(item["role"])
        if "entry" not in roles:
            raise ValueError("An entry screenshot is required")
        return clean

    def save(self, body):
        if not isinstance(body, dict):
            raise ValueError("Expected a review")
        rid = body.get("id") or uuid.uuid4().hex
        if not isinstance(rid, str) or len(rid) != 32 or any(ch not in "0123456789abcdef" for ch in rid):
            raise ValueError("Invalid review ID")
        try:
            uuid.UUID(hex=rid)
        except ValueError:
            raise ValueError("Invalid review ID") from None
        try:
            old = self.get(rid)
        except KeyError:
            old = None
        images = self.valid_images(body.get("images"))
        if old and [(i["id"], i["role"]) for i in images] != [(i["id"], i["role"]) for i in old["images"]]:
            raise ValueError("Changed screenshots need a new review ID to preserve extraction")
        # The client cannot inject AI extraction or replace an existing raw snapshot.
        raw = old["raw_extraction"] if old else extraction_layer(images)
        values = corrections(body.get("corrected_values", {}))
        rules = body.get("strategy_rules") or None
        evaluation = strategy_layer(values, rules)
        marks = annotations(body.get("annotations", []))
        status = body.get("review_status", "corrected")
        if status not in STATUSES:
            raise ValueError("Invalid review status")
        linked = body.get("linked_trade")
        if linked is not None:
            if not isinstance(linked, dict):
                raise ValueError("Invalid trade link")
            linked = {k: text(str(linked[k]), 128) if linked.get(k) is not None else None for k in ("trade_id", "source", "mode", "team_name", "manager", "opened_at", "closed_at")}
            if not linked["trade_id"] or not linked["source"] or not linked["mode"]:
                raise ValueError("Link needs trade ID, source and mode")
        team = text(body.get("team_name"), 128)
        now = utc_now()
        record = {"id": rid, "trade_id": linked["trade_id"] if linked else None, "linked_trade": linked,
                  "trade_kind": body.get("trade_kind") if body.get("trade_kind") in {"manual", "bot", "past"} else "manual",
                  "team_name": team, "linked_manager": team+" / Team Manager" if team else None,
                  "images": images, "raw_extraction": raw, "corrected_values": values,
                  "annotations": marks, "strategy_rules": rules, "strategy_evaluation": evaluation,
                  "review_status": status, "created_at": old["created_at"] if old else now, "updated_at": now}
        entry_image = next(i for i in images if i["role"] == "entry")
        record["annotated_screenshot_path"] = self.annotate(rid, entry_image, marks)
        with connect_db(self.database) as c:
            c.execute("""INSERT INTO screenshot_reviews (id,trade_id,trade_source,trade_mode,symbol,team_name,strategy,instrument,
              entry_timeframe,direction,entry_value,stop_value,target_value,reward_risk,outcome,extraction_confidence,
              raw_extraction_json,corrected_values_json,analysis_notes,screenshot_path,context_screenshot_path,
              annotated_screenshot_path,review_status,record_json,created_at,updated_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET trade_id=excluded.trade_id,trade_source=excluded.trade_source,
              trade_mode=excluded.trade_mode,symbol=excluded.symbol,team_name=excluded.team_name,strategy=excluded.strategy,
              instrument=excluded.instrument,entry_timeframe=excluded.entry_timeframe,direction=excluded.direction,
              entry_value=excluded.entry_value,stop_value=excluded.stop_value,target_value=excluded.target_value,
              reward_risk=excluded.reward_risk,outcome=excluded.outcome,corrected_values_json=excluded.corrected_values_json,
              analysis_notes=excluded.analysis_notes,screenshot_path=excluded.screenshot_path,
              context_screenshot_path=excluded.context_screenshot_path,annotated_screenshot_path=excluded.annotated_screenshot_path,
              review_status=excluded.review_status,record_json=excluded.record_json,updated_at=excluded.updated_at""",
              (rid,record["trade_id"],linked["source"] if linked else None,linked["mode"] if linked else None,
               values["instrument"],team,values["strategy"],values["instrument"],values["entry_timeframe"],values["direction"],
               values["entry_value"],values["stop_value"],values["target_value"],evaluation["reward_risk"],values["outcome"],0,
               json.dumps(raw,allow_nan=False),json.dumps(values,allow_nan=False),values["notes"],entry_image["path"],
               next((i["path"] for i in images if i["role"] == "context"),None),record["annotated_screenshot_path"],status,
               json.dumps(record,allow_nan=False),record["created_at"],now))
        return record

    def annotate(self, rid, item, marks):
        from PIL import Image, ImageDraw
        with Image.open(self.directory / item["path"]) as source:
            image = source.convert("RGB")
        image.thumbnail((2400,2400))
        draw = ImageDraw.Draw(image)
        colors = {"entry": "#60b9ff", "stop": "#ff708f", "target": "#6cf0b2", "supply": "#ff708f", "demand": "#6cf0b2"}
        w,h=image.size
        for a in marks:
            if a["role"] != item["role"]:
                continue
            x,y,x2,y2=a["x"]*w,a["y"]*h,a["x2"]*w,a["y2"]*h
            color=colors.get(a["type"],"#bca2ff")
            if a["type"] in {"supply","demand","structure"}:
                draw.rectangle((min(x,x2),min(y,y2),max(x,x2),max(y,y2)),outline=color,width=3)
            elif a["type"] in {"entry","stop","target"}:
                draw.line((0,y,w,y),fill=color,width=3)
            elif a["type"] == "cutoff":
                draw.line((x,0,x,h),fill=color,width=3)
            else:
                draw.line((x,y,x2,y2),fill=color,width=3)
            label=(a["label"] or a["type"])+" (user / estimated)"
            draw.text((min(w-180,max(4,x)),max(3,y-17)),label,fill=color)
        draw.rectangle((0,h-25,w,h),fill="#071120")
        draw.text((8,h-19),"LAYLOW / VISUAL ESTIMATES / AI NOT CONNECTED",fill="#b6c6e3")
        path=self.directory/"annotated"/(rid+".png")
        path.parent.mkdir(parents=True,exist_ok=True)
        image.save(path,"PNG")
        return "annotated/"+path.name


def register_review_routes(app, database, directory):
    from flask import request, jsonify, send_file
    import secrets
    store = ReviewStore(database, directory)

    @app.before_request
    def review_write_guard():
        if request.path.startswith('/api/reviews') and request.method != 'GET':
            if not secrets.compare_digest(request.headers.get('X-Laylow-CSRF','').encode(),app.config['CONTROL_CSRF'].encode()) or request.headers.get('Origin') not in {None,request.host_url.rstrip('/')}:
                return jsonify({"error":"invalid_control_token_or_origin"}),403

    @app.get('/api/reviews/status')
    def review_status():
        return jsonify({"storage":"local_backend","ai_connected":False,"csrf_token":app.config['CONTROL_CSRF']})

    @app.get('/api/reviews')
    def review_list():
        rows=store.list()
        for param,field in (("trade_id","trade_id"),("source","source"),("mode","mode"),("team","team_name")):
            if request.args.get(param):
                rows=[r for r in rows if (r.get("linked_trade") or {}).get(field)==request.args[param]]
        return jsonify({"reviews":rows})

    @app.post('/api/reviews/uploads')
    def review_upload():
        try:
            if set(request.files) != {'image'}:
                raise ValueError('Upload one image per role')
            return jsonify(store.upload(request.files['image'].stream,request.form.get('role'))),201
        except (ValueError,ImportError) as e:
            return jsonify({"error":str(e) if isinstance(e,ValueError) else "Install the project image dependencies"}),400

    @app.post('/api/reviews/analyze')
    def review_analyze():
        try:
            body=request.get_json(silent=True) or {}
            if not isinstance(body,dict):
                raise ValueError("Expected a review object")
            items=store.valid_images(body.get('images'))
            return jsonify({"raw_extraction":extraction_layer(items),"strategy_evaluation":strategy_layer(corrections(body.get('corrected_values',{})),body.get('strategy_rules')),"ai_connected":False})
        except (ValueError,ImportError) as e:
            return jsonify({"error":str(e) if isinstance(e,ValueError) else "Install the project image dependencies"}),400

    @app.post('/api/reviews')
    def review_save():
        try:
            return jsonify(store.save(request.get_json(silent=True))),201
        except (ValueError,ImportError) as e:
            return jsonify({"error":str(e) if isinstance(e,ValueError) else "Install the project image dependencies"}),400
        except OSError:
            return jsonify({"error":"Review files could not be saved"}),503

    @app.get('/api/reviews/<review_id>')
    def review_detail(review_id):
        try:
            return jsonify(store.get(review_id))
        except KeyError:
            return jsonify({"error":"review_not_found"}),404

    @app.get('/api/reviews/files/<kind>/<name>')
    def review_file(kind,name):
        if kind not in {'originals','annotated'} or len(name)!=36 or not name.endswith('.png'):
            return jsonify({"error":"file_not_found"}),404
        try:
            uuid.UUID(hex=name[:-4])
        except ValueError:
            return jsonify({"error":"file_not_found"}),404
        file=store.directory/kind/name
        if not file.is_file():
            return jsonify({"error":"file_not_found"}),404
        return send_file(file,mimetype='image/png')
