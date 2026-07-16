function jsonEscape(value) {
  value = String(value || "");
  value = value.replace(/\\/g, "\\\\");
  value = value.replace(/\"/g, "\\\"");
  value = value.replace(/\r/g, "\\r");
  value = value.replace(/\n/g, "\\n");
  return value;
}

var MoongetsuToolkit = {};

/* ── Transform ──────────────────────────────────────────────── */

MoongetsuToolkit.alignLayers = function (posIndex) {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    var layers = comp.selectedLayers;
    if (layers.length === 0) return '{"ok":false,"message":"No layers selected."}';
    app.beginUndoGroup("AniSmooth Align");
    var col = posIndex % 3;
    var row = Math.floor(posIndex / 3);
    for (var i = 0; i < layers.length; i++) {
      var l = layers[i];
      var w = l.sourceRectAtTime(comp.time, false).width * (l.scale[0] / 100);
      var h = l.sourceRectAtTime(comp.time, false).height * (l.scale[1] / 100);
      var left = l.sourceRectAtTime(comp.time, false).left * (l.scale[0] / 100);
      var top = l.sourceRectAtTime(comp.time, false).top * (l.scale[1] / 100);
      var anchorX = (left + w / 2) - l.anchorPoint[0];
      var anchorY = (top + h / 2) - l.anchorPoint[1];
      if (col === 0) l.position.setValue([l.position[0] - anchorX, l.position[1]]);
      else if (col === 1) l.position.setValue([comp.width / 2 - anchorX, l.position[1]]);
      else if (col === 2) l.position.setValue([comp.width - anchorX - w, l.position[1]]);
      if (row === 0) l.position.setValue([l.position[0], l.position[1] - anchorY]);
      else if (row === 1) l.position.setValue([l.position[0], comp.height / 2 - anchorY]);
      else if (row === 2) l.position.setValue([l.position[0], comp.height - anchorY - h]);
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Align error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.fitToComp = function () {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    var layers = comp.selectedLayers;
    if (layers.length === 0) return '{"ok":false,"message":"No layers selected."}';
    app.beginUndoGroup("AniSmooth Fit to Comp");
    for (var i = 0; i < layers.length; i++) {
      var l = layers[i];
      var srx = l.sourceRectAtTime(comp.time, false);
      var w = srx.width;
      var h = srx.height;
      if (w <= 0 || h <= 0) continue;
      var scaleX = (comp.width / w) * 100;
      var scaleY = (comp.height / h) * 100;
      var s = Math.min(scaleX, scaleY);
      l.scale.setValue([s, s]);
      l.position.setValue([comp.width / 2, comp.height / 2]);
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Fit to comp error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.centerAnchorPoint = function () {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    var layers = comp.selectedLayers;
    if (layers.length === 0) return '{"ok":false,"message":"No layers selected."}';
    app.beginUndoGroup("AniSmooth Center Anchor");
    for (var i = 0; i < layers.length; i++) {
      var l = layers[i];
      var sr = l.sourceRectAtTime(comp.time, false);
      l.anchorPoint.setValue([sr.width / 2 + sr.left, sr.height / 2 + sr.top]);
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Center anchor error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.flip = function (axis) {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    var layers = comp.selectedLayers;
    if (layers.length === 0) return '{"ok":false,"message":"No layers selected."}';
    app.beginUndoGroup("AniSmooth Flip");
    for (var i = 0; i < layers.length; i++) {
      var l = layers[i];
      if (axis === "x") l.scale.setValue([-l.scale[0], l.scale[1]]);
      else l.scale.setValue([l.scale[0], -l.scale[1]]);
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Flip error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.rotate = function (degrees) {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    var layers = comp.selectedLayers;
    if (layers.length === 0) return '{"ok":false,"message":"No layers selected."}';
    app.beginUndoGroup("AniSmooth Rotate");
    for (var i = 0; i < layers.length; i++) {
      layers[i].rotation.setValue(layers[i].rotation.value + degrees);
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Rotate error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

/* ── Layer Ops ──────────────────────────────────────────────── */

MoongetsuToolkit.precomposeSelected = function () {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    var layers = comp.selectedLayers;
    if (layers.length === 0) return '{"ok":false,"message":"No layers selected."}';
    app.beginUndoGroup("AniSmooth Precompose");
    var newComp = comp.layers.precompose(layers, "Precomp " + (comp.numLayers + 1), true);
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Precompose error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.createNull = function () {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    app.beginUndoGroup("AniSmooth Null");
    var nullLayer = comp.layers.addNull();
    nullLayer.name = "Null " + nullLayer.index;
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Create null error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.createAdj = function () {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    app.beginUndoGroup("AniSmooth Adjustment Layer");
    var adj = comp.layers.addSolid([1, 1, 1], "Adjustment Layer", comp.width, comp.height, 1);
    adj.adjustmentLayer = true;
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Create adj error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.createSolid = function () {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    app.beginUndoGroup("AniSmooth Solid");
    comp.layers.addSolid([0, 0, 0], "Black Solid", comp.width, comp.height, 1);
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Create solid error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.selectNoPrecomps = function () {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    app.beginUndoGroup("AniSmooth Select");
    comp.selectedLayers = [];
    for (var i = 1; i <= comp.numLayers; i++) {
      var l = comp.layer(i);
      if (!(l.source instanceof CompItem) || l.source instanceof FootageItem) {
        l.selected = true;
      }
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Select error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.addFrameToSelectedLayers = function () {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    var layers = comp.selectedLayers;
    if (layers.length === 0) return '{"ok":false,"message":"No layers selected."}';
    app.beginUndoGroup("AniSmooth Fix Precomp Duration");
    var frameSec = comp.frameDuration;
    for (var i = 0; i < layers.length; i++) {
      var l = layers[i];
      if (l.source instanceof CompItem) {
        l.outPoint = l.outPoint + frameSec;
      }
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Add frame error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.createCustomFolders = function (mainName, subs) {
  try {
    if (!app.project) return '{"ok":false,"message":"No project open."}';
    app.beginUndoGroup("AniSmooth Folders");
    var root = app.project.items.addFolder(mainName);
    for (var i = 0; i < subs.length; i++) {
      root.items.addFolder(subs[i]);
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Create folders error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.resetSelected = function (transform, effects, masks, expressions) {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    var layers = comp.selectedLayers;
    if (layers.length === 0) return '{"ok":false,"message":"No layers selected."}';
    app.beginUndoGroup("AniSmooth Reset");
    for (var i = 0; i < layers.length; i++) {
      var l = layers[i];
      if (transform) {
        l.position.setValue([comp.width / 2, comp.height / 2]);
        l.scale.setValue([100, 100]);
        l.rotation.setValue(0);
        l.opacity.setValue(100);
      }
      if (effects) {
        while (l.property("ADBE Effect Parade").numProperties > 0) {
          l.property("ADBE Effect Parade").property(1).remove();
        }
      }
      if (masks) {
        while (l.property("ADBE Mask Parade").numProperties > 0) {
          l.property("ADBE Mask Parade").property(1).remove();
        }
      }
      if (expressions && l.transform) {
        for (var p = 1; p <= l.transform.numProperties; p++) {
          try { l.transform.property(p).expression = ""; } catch (e) {}
        }
      }
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Reset error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

/* ── FX & Ease ──────────────────────────────────────────────── */

MoongetsuToolkit.applyEasyEase = function (mode) {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    var layers = comp.selectedLayers;
    if (layers.length === 0) return '{"ok":false,"message":"No layers selected."}';
    app.beginUndoGroup("AniSmooth Ease");
    for (var i = 0; i < layers.length; i++) {
      var props = layers[i].selectedProperties;
      if (props.length === 0) {
        var tp = layers[i].transform;
        if (tp && tp.position) props = [tp.position];
      }
      for (var p = 0; p < props.length; p++) {
        if (!props[p].isTimeVarying) continue;
        var keys = props[p].selectedKeys.length > 0 ? props[p].selectedKeys : [];
        if (keys.length === 0) {
          for (var k = 1; k <= props[p].numKeys; k++) keys.push(k);
        }
        for (var k2 = 0; k2 < keys.length; k2++) {
          var ease = new KeyframeEase(0.333, 0.333);
          if (mode === "in") ease = new KeyframeEase(0, 0.667);
          else if (mode === "out") ease = new KeyframeEase(0.667, 0);
          props[p].setTemporalEaseAtKey(keys[k2], [ease], [ease]);
        }
      }
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Ease error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.applyEaseCurve = function (preset) {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    var layers = comp.selectedLayers;
    if (layers.length === 0) return '{"ok":false,"message":"No layers selected."}';
    app.beginUndoGroup("AniSmooth Ease Curve");
    var inInfluence = 33.33;
    var outInfluence = 33.33;
    var inSpeed = 0;
    var outSpeed = 0;
    if (preset === "fastIn") { inSpeed = 0; outSpeed = 100; }
    else if (preset === "fastOut") { inSpeed = 100; outSpeed = 0; }
    else if (preset === "linear") { inInfluence = 33.33; outInfluence = 33.33; inSpeed = 33.33; outSpeed = 33.33; }
    for (var i = 0; i < layers.length; i++) {
      var props = layers[i].selectedProperties;
      if (props.length === 0) {
        var tp = layers[i].transform;
        if (tp && tp.position) props = [tp.position];
      }
      for (var p = 0; p < props.length; p++) {
        if (!props[p].isTimeVarying) continue;
        var keyCount = props[p].numKeys;
        for (var k = 1; k <= keyCount; k++) {
          var ease = new KeyframeEase(inSpeed, inInfluence);
          var easeOut = new KeyframeEase(outSpeed, outInfluence);
          props[p].setTemporalEaseAtKey(k, [ease], [easeOut]);
        }
      }
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Curve error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.addEffect = function (matchName) {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    var layers = comp.selectedLayers;
    if (layers.length === 0) return '{"ok":false,"message":"No layers selected."}';
    app.beginUndoGroup("AniSmooth Add Effect");
    for (var i = 0; i < layers.length; i++) {
      try { layers[i].property("ADBE Effect Parade").addProperty(matchName); } catch (e2) {}
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Add effect error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.addFillEffect = function () {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    var layers = comp.selectedLayers;
    if (layers.length === 0) return '{"ok":false,"message":"No layers selected."}';
    app.beginUndoGroup("AniSmooth Fill Effect");
    for (var i = 0; i < layers.length; i++) {
      var ef = layers[i].property("ADBE Effect Parade").addProperty("ADBE Fill");
      if (ef && ef.property("ADBE Fill-0002")) ef.property("ADBE Fill-0002").setValue([0, 0, 0]);
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Fill effect error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.addBlurEffect = function () {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    var layers = comp.selectedLayers;
    if (layers.length === 0) return '{"ok":false,"message":"No layers selected."}';
    app.beginUndoGroup("AniSmooth Blur");
    for (var i = 0; i < layers.length; i++) {
      var ef = layers[i].property("ADBE Effect Parade").addProperty("ADBE Fast Blur");
      if (ef && ef.property("ADBE Fast Blur-0001")) ef.property("ADBE Fast Blur-0001").setValue(15);
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Blur error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.addSharpenEffect = function () {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    var layers = comp.selectedLayers;
    if (layers.length === 0) return '{"ok":false,"message":"No layers selected."}';
    app.beginUndoGroup("AniSmooth Sharpen");
    for (var i = 0; i < layers.length; i++) {
      var ef = layers[i].property("ADBE Effect Parade").addProperty("ADBE Sharpen");
      if (ef && ef.property("ADBE Sharpen-0001")) ef.property("ADBE Sharpen-0001").setValue(25);
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Sharpen error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.addMirrorEffect = function () {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    var layers = comp.selectedLayers;
    if (layers.length === 0) return '{"ok":false,"message":"No layers selected."}';
    app.beginUndoGroup("AniSmooth Mirror");
    for (var i = 0; i < layers.length; i++) {
      layers[i].property("ADBE Effect Parade").addProperty("ADBE Mirror");
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Mirror error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.addCamera = function () {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    app.beginUndoGroup("AniSmooth Camera");
    comp.layers.addCamera("Camera " + (comp.numLayers + 1), [comp.width / 2, comp.height / 2]);
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Camera error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.saveFrame = function () {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    var frameNum = Math.floor(comp.time * comp.frameRate);
    var desktop = Folder.desktop ? Folder.desktop.fsName : (Folder.myDocuments ? Folder.myDocuments.fsName : "~/Desktop");
    var f = new File(desktop + "/Frame_" + frameNum + ".png");
    app.beginUndoGroup("AniSmooth Save Frame");
    var rqItem = app.project.renderQueue.items.add(comp);
    var om = rqItem.outputModule(1);
    om.file = f;
    rqItem.timeSpanStart = comp.time;
    rqItem.timeSpanDuration = comp.frameDuration;
    rqItem.render = true;
    app.project.renderQueue.render();
    rqItem.remove();
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Save frame error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

/* ── Expressions ────────────────────────────────────────────── */

MoongetsuToolkit.applyExpression = function (exprType) {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    var layers = comp.selectedLayers;
    if (layers.length === 0) return '{"ok":false,"message":"No layers selected."}';
    app.beginUndoGroup("AniSmooth Expression");
    var expr = "";
    if (exprType === "wiggle") expr = "wiggle(2, 50);";
    else if (exprType === "loopOutCycle") expr = "loopOut(\"cycle\");";
    else if (exprType === "loopOutPingPong") expr = "loopOut(\"pingpong\");";
    else if (exprType === "elasticBounce") expr = "n = 0; if (numKeys > 0){ n = nearestKey(time).index; if (key(n).time > time) n--; } if (n > 0){ t = time - key(n).time; v = key(n).value; a = 5; f = 25; d = 0.01; v + a * Math.exp(-d * t) * Math.sin(f * t * 2 * Math.PI); } else value;";
    for (var i = 0; i < layers.length; i++) {
      var props = layers[i].selectedProperties;
      if (props.length === 0 && layers[i].transform && layers[i].transform.position) {
        props = [layers[i].transform.position];
      }
      for (var p = 0; p < props.length; p++) {
        try { props[p].expression = expr; } catch (e2) {}
      }
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Expression error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

/* ── Timeline & RAM ─────────────────────────────────────────── */

MoongetsuToolkit.freezeFrame = function () {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    var layers = comp.selectedLayers;
    if (layers.length === 0) return '{"ok":false,"message":"No layers selected."}';
    app.beginUndoGroup("AniSmooth Freeze Frame");
    for (var i = 0; i < layers.length; i++) {
      var l = layers[i];
      l.enableTimeRemapping();
      var tr = l.property("ADBE Time Remapping");
      var lastKey = tr.numKeys > 0 ? tr.keyValue(tr.numKeys) : tr.value;
      tr.setValueAtKey(tr.numKeys, lastKey);
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Freeze frame error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.trimOut = function () {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    var layers = comp.selectedLayers;
    if (layers.length === 0) return '{"ok":false,"message":"No layers selected."}';
    app.beginUndoGroup("AniSmooth Trim Out");
    for (var i = 0; i < layers.length; i++) {
      layers[i].outPoint = comp.time;
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Trim error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.moveLayers = function (dir) {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    var layers = comp.selectedLayers;
    if (layers.length === 0) return '{"ok":false,"message":"No layers selected."}';
    app.beginUndoGroup("AniSmooth Move Layer");
    for (var i = 0; i < layers.length; i++) {
      try {
        if (dir < 0) layers[i].moveBefore(layers[i].index - 1 >= 1 ? comp.layer(layers[i].index - 1) : null);
        else layers[i].moveAfter(layers[i].index + 1 <= comp.numLayers ? comp.layer(layers[i].index + 1) : null);
      } catch (e2) {}
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Move layer error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.shiftLayers = function (frames) {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    var layers = comp.selectedLayers;
    if (layers.length < 2) return '{"ok":false,"message":"Select at least 2 layers to sequence."}';
    app.beginUndoGroup("AniSmooth Sequence");
    var offset = 0;
    var frameSec = comp.frameDuration;
    for (var i = 0; i < layers.length; i++) {
      layers[i].startTime = offset * frameSec;
      offset += frames;
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Sequence error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.purgeRAM = function () {
  try {
    app.purge(PurgeTarget.ALL_CACHES);
    return '{"ok":true}';
  } catch (err) {
    return '{"ok":false,"message":"Purge RAM error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

/* ── Project Helper ─────────────────────────────────────────── */

MoongetsuToolkit.getSuggestedProjectName = function () {
  try {
    if (!app.project) return '{"ok":false,"message":"No project open."}';
    var name = app.project.file ? app.project.file.name.replace(/\.[^.]+$/, "") : "Untitled";
    return '"' + jsonEscape(name) + '"';
  } catch (err) {
    return '"Untitled"';
  }
};

MoongetsuToolkit.runProjectHelper = function (newName, renameAdj, renameNulls, renameSolids, renameComps, organize, reduce) {
  try {
    if (!app.project) return '{"ok":false,"message":"No project open."}';
    app.beginUndoGroup("AniSmooth Project Helper");
    var root = app.project.items;

    if (newName && newName !== "") {
      try { app.project.file = new File(app.project.file.parent.fsName + "/" + newName + ".aep"); } catch (e) {}
    }

    if (organize) {
      var footageFolder = root.addFolder("Footage");
      for (var i = root.numItems; i >= 1; i--) {
        var item = root.item(i);
        if (item instanceof FootageItem && item !== footageFolder) {
          item.parentFolder = footageFolder;
        }
      }
      var compsFolder = root.addFolder("Comps");
      for (var j = root.numItems; j >= 1; j--) {
        var it = root.item(j);
        if (it instanceof CompItem && it !== compsFolder) {
          it.parentFolder = compsFolder;
        }
      }
    }

    if (reduce) {
      app.project.reduceProject(root);
    }

    var allItems = [];
    function collectItems(folder) {
      for (var k = 1; k <= folder.numItems; k++) {
        var item = folder.item(k);
        allItems.push(item);
        if (item instanceof FolderItem) collectItems(item);
      }
    }
    collectItems(root);

    for (var m = 0; m < allItems.length; m++) {
      var ai = allItems[m];
      if (ai instanceof CompItem) {
        if (renameComps && ai.name.indexOf("Comp") >= 0) ai.name = newName || ai.name;
        for (var cl = 1; cl <= ai.numLayers; cl++) {
          var layer = ai.layer(cl);
          if (renameAdj && layer.adjustmentLayer) layer.name = "Adj " + (layer.index);
          else if (renameNulls && layer.nullLayer) layer.name = "Null " + (layer.index);
          else if (renameSolids && layer.source && layer.source.mainSource && layer.source.mainSource instanceof SolidSource) {
            layer.name = "Solid " + (layer.index);
          }
        }
      }
    }

    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Project helper error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.packageProjectForPayhip = function (name) {
  try {
    if (!app.project) return '{"ok":false,"message":"No project open."}';
    var baseDir = app.project.file ? app.project.file.parent.fsName : Folder.desktop.fsName;
    var pkgDir = new Folder(baseDir + "/" + name + "_Payhip");
    if (!pkgDir.exists) pkgDir.create();
    var savePath = new File(pkgDir.fsName + "/" + name + ".aep");
    app.project.save(savePath);
    try {
      app.project.reduceProject(app.project.items);
    } catch (e2) {}
    return '{"ok":true,"message":"Packaged to ' + jsonEscape(pkgDir.fsName) + '"}';
  } catch (err) {
    return '{"ok":false,"message":"Package error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.scanProjectDependencies = function () {
  try {
    if (!app.project) return '{"ok":false,"message":"No project open."}';
    var plugins = [];
    var fonts = [];
    var expressions = [];
    var pluginSet = {};
    var fontSet = {};

    var allItems = [];
    function collectItems(folder) {
      for (var i = 1; i <= folder.numItems; i++) {
        var item = folder.item(i);
        allItems.push(item);
        if (item instanceof FolderItem) collectItems(item);
      }
    }
    collectItems(app.project.items);

    for (var j = 0; j < allItems.length; j++) {
      var ai = allItems[j];
      if (ai instanceof CompItem) {
        for (var cl = 1; cl <= ai.numLayers; cl++) {
          var layer = ai.layer(cl);
          try {
            var ep = layer.property("ADBE Effect Parade");
            for (var e = 1; e <= ep.numProperties; e++) {
              var ef = ep.property(e);
              if (!pluginSet[ef.name]) {
                pluginSet[ef.name] = true;
                plugins.push(ef.matchName + " (" + ef.name + ")");
              }
            }
          } catch (e3) {}
          try {
            for (var tp = 1; tp <= layer.transform.numProperties; tp++) {
              var prop = layer.transform.property(tp);
              if (prop.expression && prop.expression.length > 0) {
                expressions.push("Layer \"" + jsonEscape(layer.name).replace(/\\"/g, '"') + "\" " + prop.name + ": " + prop.expression.slice(0, 80).replace(/\n/g, " "));
              }
            }
          } catch (e4) {}
        }
      }
    }

    var pluginsJson = "[";
    for (var pj = 0; pj < plugins.length; pj++) {
      if (pj > 0) pluginsJson += ",";
      pluginsJson += '"' + jsonEscape(plugins[pj]) + '"';
    }
    pluginsJson += "]";
    var exprsJson = "[";
    for (var ej = 0; ej < expressions.length; ej++) {
      if (ej > 0) exprsJson += ",";
      exprsJson += '"' + jsonEscape(expressions[ej]) + '"';
    }
    exprsJson += "]";
    return '{"ok":true,"plugins":' + pluginsJson + ',"fonts":[],"expressions":' + exprsJson + '}';
  } catch (err) {
    return '{"ok":false,"message":"Scan error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

/* ── ColorFlow ──────────────────────────────────────────────── */

MoongetsuToolkit.applyColorToSelectedLayers = function (hex) {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    var layers = comp.selectedLayers;
    if (layers.length === 0) return '{"ok":false,"message":"No layers selected."}';
    app.beginUndoGroup("AniSmooth Apply Color");
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    var labelColors = [
      { idx: 0, hex: [219, 219, 219] },
      { idx: 1, hex: [245, 66, 66] },
      { idx: 2, hex: [245, 233, 66] },
      { idx: 3, hex: [66, 245, 239] },
      { idx: 4, hex: [245, 66, 155] },
      { idx: 5, hex: [168, 66, 245] },
      { idx: 6, hex: [245, 167, 66] },
      { idx: 7, hex: [66, 245, 141] },
      { idx: 8, hex: [66, 66, 245] },
      { idx: 9, hex: [66, 214, 66] },
      { idx: 10, hex: [165, 66, 214] },
      { idx: 11, hex: [214, 140, 66] },
      { idx: 12, hex: [140, 90, 43] },
      { idx: 13, hex: [214, 66, 198] },
      { idx: 14, hex: [66, 179, 214] },
      { idx: 15, hex: [214, 204, 66] },
      { idx: 16, hex: [255, 255, 255] }
    ];
    var bestIdx = 1;
    var bestDist = Infinity;
    for (var lc = 0; lc < labelColors.length; lc++) {
      var dr = r - labelColors[lc].hex[0];
      var dg = g - labelColors[lc].hex[1];
      var db = b - labelColors[lc].hex[2];
      var dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) { bestDist = dist; bestIdx = labelColors[lc].idx; }
    }
    for (var i = 0; i < layers.length; i++) {
      layers[i].label = bestIdx;
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Apply color error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.autoLabelComp = function () {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    app.beginUndoGroup("AniSmooth Auto Label");
    var colorIdx = 1;
    for (var i = 1; i <= comp.numLayers; i++) {
      var l = comp.layer(i);
      if (l.source && l.source.mainSource && l.source.mainSource instanceof SolidSource) {
        var labelIdx = ((i - 1) % 16) + 1;
        l.label = labelIdx;
      }
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Auto label error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.createSolidPalette = function (hexList) {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    app.beginUndoGroup("AniSmooth Palette Solids");
    for (var i = 0; i < hexList.length; i++) {
      var r = parseInt(hexList[i].slice(1, 3), 16) / 255;
      var g = parseInt(hexList[i].slice(3, 5), 16) / 255;
      var b = parseInt(hexList[i].slice(5, 7), 16) / 255;
      comp.layers.addSolid([r, g, b], hexList[i], comp.width, comp.height, 1);
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Palette solids error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.randomizeColorsOnSelection = function (hexList) {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    var layers = comp.selectedLayers;
    if (layers.length === 0) return '{"ok":false,"message":"No layers selected."}';
    app.beginUndoGroup("AniSmooth Randomize Colors");
    for (var i = 0; i < layers.length; i++) {
      var idx = Math.floor(Math.random() * hexList.length);
      var labelIdx = (idx % 16) + 1;
      var r = parseInt(hexList[idx].slice(1, 3), 16) / 255;
      var g = parseInt(hexList[idx].slice(3, 5), 16) / 255;
      var b = parseInt(hexList[idx].slice(5, 7), 16) / 255;
      layers[i].label = labelIdx;
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Randomize error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.setSelectionLabelColor = function (index) {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    var layers = comp.selectedLayers;
    if (layers.length === 0) return '{"ok":false,"message":"No layers selected."}';
    app.beginUndoGroup("AniSmooth Label Color");
    for (var i = 0; i < layers.length; i++) {
      layers[i].label = index;
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Label error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.selectLayersByLabelColor = function (index) {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    app.beginUndoGroup("AniSmooth Select By Label");
    comp.selectedLayers = [];
    for (var i = 1; i <= comp.numLayers; i++) {
      if (comp.layer(i).label === index) comp.layer(i).selected = true;
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Select by label error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.toggleLabelColorVisibility = function (index, visible) {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    app.beginUndoGroup("AniSmooth Toggle Visibility");
    for (var i = 1; i <= comp.numLayers; i++) {
      if (comp.layer(i).label === index) comp.layer(i).enabled = visible;
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Toggle visibility error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};

MoongetsuToolkit.soloLabelColorLayers = function (index, soloed) {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return '{"ok":false,"message":"No active composition."}';
    app.beginUndoGroup("AniSmooth Solo Label");
    for (var i = 1; i <= comp.numLayers; i++) {
      if (soloed) {
        comp.layer(i).solo = (comp.layer(i).label === index);
      } else {
        comp.layer(i).solo = false;
      }
    }
    app.endUndoGroup();
    return '{"ok":true}';
  } catch (err) {
    try { app.endUndoGroup(); } catch (e) {}
    return '{"ok":false,"message":"Solo error: ' + jsonEscape(err.message || err.toString()) + '"}';
  }
};
