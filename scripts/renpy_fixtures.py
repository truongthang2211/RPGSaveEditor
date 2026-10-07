"""
Builds Ren'Py-like test saves for src/formats/renpy (no Ren'Py needed), and
checks saves written by the editor.

    python scripts/renpy_fixtures.py make              # writes the fixtures
    python scripts/renpy_fixtures.py check FILE.save   # prints its variables

A Ren'Py save is a zip whose "log" entry is pickle.dumps((roots, log)), where
roots maps "store.<name>" to the game's variables. Fake classes stand in for
Ren'Py's own (same module and class names), so the pickles look like real ones.
"""

import io
import json
import pickle
import sys
import types
import zipfile
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "src" / "formats" / "renpy" / "__fixtures__"


def module(name):
    mod = types.ModuleType(name)
    sys.modules[name] = mod
    return mod


def define(mod, cls):
    cls.__module__ = mod.__name__
    setattr(mod, cls.__name__, cls)
    return cls


renpy = module("renpy")
revertable = module("renpy.revertable")
rollback = module("renpy.rollback")
store = module("store")


@lambda c: define(revertable, c)
class RevertableDict(dict):
    pass


@lambda c: define(revertable, c)
class RevertableList(list):
    pass


@lambda c: define(revertable, c)
class RevertableSet(set):
    pass


@lambda c: define(rollback, c)
class Rollback(object):
    def __init__(self, stores):
        self.stores = stores
        self.context = None
        self.objects = []


@lambda c: define(rollback, c)
class Log(object):
    def __init__(self, log):
        self.log = log
        self.current = log[-1]


@lambda c: define(store, c)
class Player(object):
    def __init__(self, name, hp):
        self.name = name
        self.hp = hp
        self.friends = RevertableList()


def make_roots():
    name = "Alex"  # stored once, read back through the memo for "nickname"
    player = Player(name, 10)
    player.friends.append(player)  # a cycle
    roots = {
        "store.money": 120,
        "store.love_points": 3,
        "store.negative": -5,
        "store.big_number": 70000,
        "store.huge": 2**70,
        "store.ratio": 0.5,
        "store.met_lily": True,
        "store.angry": False,
        "store.nothing": None,
        "store.mc_name": name,
        "store.nickname": name,
        "store.unicode_name": "Ånna ✓",
        "store.inventory": RevertableList(["key", "map"]),
        "store.flags": RevertableDict({"door_open": True, "visits": 2}),
        "store.tags": RevertableSet({"brave"}),
        "store.pair": (1, "two"),
        "store.player": player,
        "store._window": True,
        "store.save_name": "",
        "store.mystore.counter": 7,
        "store.history": RevertableList(["line %d" % i for i in range(9000)]),
    }
    # What loading restores: old values of variables and snapshots of objects
    # changed since the last checkpoint (the rollback log).
    flags = roots["store.flags"]
    first = Rollback({"store": {"money": 100}})
    last = Rollback({"store": {"money": 110, "met_lily": False}})
    last.objects = [(player, dict(player.__dict__, hp=7)), (flags, [("door_open", False), ("visits", 1)])]
    log = Log([first, last])
    return roots, log


def make_save(data):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("screenshot.png", b"\x89PNG\r\n\x1a\nfake")
        zf.writestr("extra_info", "Chapter 2".encode("utf-8"))
        zf.writestr("json", json.dumps({"_save_name": "Chapter 2", "_renpy_version": [8, 3, 0, 0]}))
        zf.writestr("renpy_version", "8.3.0.24082114")
        zf.writestr("log", data)
        zf.writestr("signatures", "signature fake\n")
    return buf.getvalue()


def make():
    OUT.mkdir(parents=True, exist_ok=True)
    roots, log = make_roots()
    for protocol in (2, 5):
        data = pickle.dumps((roots, log), protocol)
        (OUT / ("p%d.pickle" % protocol)).write_bytes(data)
    (OUT / "1-1-LT1.save").write_bytes(make_save(pickle.dumps((roots, log), 5)))
    print("written to", OUT)


def check(path):
    data = Path(path).read_bytes()
    if data[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            names = zf.namelist()
            data = zf.read("log")
        print("entries:", names)
    roots, log = pickle.loads(data)
    for key in sorted(roots):
        value = roots[key]
        if key == "store.history":
            value = "%s(%d) last=%r" % (type(value).__name__, len(value), value[-1])
        elif key == "store.player":
            value = "Player(name=%r, hp=%r, cycle=%r)" % (value.name, value.hp, value.friends[0] is value)
        print("%s = %r" % (key, value))
    print("log rollbacks:", len(log.log), "player shared:", log.log[1].stores["store"]["player"] is roots["store.player"])


if __name__ == "__main__":
    if sys.argv[1:2] == ["make"]:
        make()
    elif sys.argv[1:2] == ["check"]:
        check(sys.argv[2])
    else:
        print(__doc__)
