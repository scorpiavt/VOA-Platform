(function () {
  if (typeof mp === "undefined") return;
  if (!mp) return;
  var lastHitAt = {};
  mp["_voaHit"] = function (senderFormId, targetFormId, damage) {
    try {
      var sid = +senderFormId;
      var tid = +targetFormId;
      var dmg = +damage;
      if (!sid || !tid) return;
      if (sid === tid) return;
      if (!(dmg > 0)) dmg = 0.2;
      if (dmg > 0.5) dmg = 0.5;
      var key = sid + ":" + tid;
      var now = +new Date();
      if (lastHitAt[key] && now - lastHitAt[key] < 180) return;
      lastHitAt[key] = now;
      var hp = 1;
      try {
        hp = +mp.get(tid, "healthPercentage");
      } catch (e0) {
        hp = 1;
      }
      if (!(hp >= 0)) hp = 1;
      if (hp > 1) hp = 1;
      var next = hp - dmg;
      if (next < 0) next = 0;
      try {
        mp.set(tid, "healthPercentage", next);
      } catch (e1) {}
      if (next <= 0.001) {
        try {
          mp.set(tid, "isDead", true);
        } catch (e2) {}
      }
    } catch (eAll) {}
  };
})();
