// Author: Peter Jensen
(function() {

  // configuration
  var config = {
    surfaceWidth:  1000,
    surfaceHeight: 400,
    birdWidth:     10,
    birdHeight:    10,
    maxBirds:      100000
  };

  var logger = function () {
    
    var traceEnabled = true;
    
    function trace(msg) {
      if (traceEnabled) {
        console.log(msg);
      }
    }

    function error(msg) {
      console.log(msg);
    }

    function traceDisable() {
      traceEnabled = false;
    }

    function traceEnable() {
      traceEnabled = true;
    }

    return {
      trace: trace,
      error: error,
      traceEnable: traceEnable,
      traceDisable: traceDisable
    }
  }();

  // Keep track of bird positions and velocities

  var birds = function () {

    var maxPos      = 1000.0;
    var actualBirds = 0;
    var posArray    = new Float32Array(config.maxBirds);
    var velArray    = new Float32Array(config.maxBirds);

    var accelData = {
      steps:     20000,
      interval:  0.002,  // time in millis seconds for each accel value
      values:   [10.0, 9.0, 8.0, 7.0, 6.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0].map(function(v) { return 50*v; })
    }

    function init(maxPosition) {
      actualBirds = 0;
      maxPos      = maxPosition;
    }
        
    function addBird(pos, vel) {
      if (actualBirds >= config.maxBirds) {
        logger.error("maxBirds exceeded");
        return -1;
      }
      posArray[actualBirds] = pos;
      velArray[actualBirds] = vel;
      actualBirds++;
      return actualBirds - 1;
    }

    function removeLastBird() {
      if (actualBirds > 0) {
        actualBirds--;
      }
    }

    function updateAll(timeDelta) {
//      var steps               = Math.ceil(timeDelta/accelData.interval);
      var steps               = accelData.steps;
      var accelCount          = accelData.values.length;
      var subTimeDelta        = timeDelta/steps/1000.0;
      var subTimeDeltaSquared = subTimeDelta*subTimeDelta;
      for (var i = 0; i < actualBirds; ++i) {
        var accelIndex          = 0;
        var newPos = posArray[i];
        var newVel = velArray[i];
        for (var a = 0; a < steps; ++a) {
          var accel = accelData.values[accelIndex];
          accelIndex = (accelIndex + 1) % accelCount;
          var posDelta = 0.5*accel*subTimeDeltaSquared + newVel*subTimeDelta;
          newPos = newPos + posDelta;
          newVel = accel*subTimeDelta + newVel;
          if (newPos > maxPos) {
            newVel = -newVel;
          }
        }
        posArray[i] = newPos;
        velArray[i] = newVel;
      }
    }    

    function updateAllSimd(timeDelta) {
//      var steps        = Math.ceil(timeDelta/accelData.interval);
      var steps        = accelData.steps;
      var accelCount   = accelData.values.length;
      var subTimeDelta = timeDelta/steps/1000.0;

      var posArrayx4            = new Float32x4Array(posArray.buffer);
      var velArrayx4            = new Float32x4Array(velArray.buffer);
      var maxPosx4              = SIMD.float32x4.splat(maxPos);
      var subTimeDeltax4        = SIMD.float32x4.splat(subTimeDelta);
      var subTimeDeltaSquaredx4 = SIMD.float32x4.mul(subTimeDeltax4, subTimeDeltax4);
      var point5x4              = SIMD.float32x4.splat(0.5);

      for (var i = 0, len = (actualBirds+3)>>2; i < len; ++i) {
        var accelIndex = 0;
        var newVelTruex4;
        var newPosx4 = posArrayx4.getAt(i);
        var newVelx4 = velArrayx4.getAt(i);
        for (var a = 0; a < steps; ++a) {
          var accel              = accelData.values[accelIndex];
          var accelx4            = SIMD.float32x4.splat(accel);
          accelIndex             = (accelIndex + 1) % accelCount;
          var posDeltax4;
          posDeltax4 = SIMD.float32x4.mul(point5x4, SIMD.float32x4.mul(accelx4, subTimeDeltaSquaredx4));
          posDeltax4 = SIMD.float32x4.add(posDeltax4, SIMD.float32x4.mul(newVelx4,subTimeDeltax4));
          newPosx4   = SIMD.float32x4.add(newPosx4, posDeltax4);
          newVelx4 = SIMD.float32x4.add(newVelx4, SIMD.float32x4.mul(accelx4, subTimeDeltax4));
          var cmpx4 = SIMD.float32x4.greaterThan(newPosx4, maxPosx4);
          newVelTruex4 = SIMD.float32x4.neg(newVelx4);
          newVelx4 = SIMD.int32x4.select(cmpx4, newVelTruex4, newVelx4);
        }
        posArrayx4.setAt(i, newPosx4);
        velArrayx4.setAt(i, newVelx4);
      }
    }    

    function posOf(index) {
      return posArray[index];
    }

    function dumpOne(index) {
      logger.trace(index + ". pos:" + posArray[index] + ", vel:" + velArray[index]);
    }

    return {
      init:           init,
      addBird:        addBird,
      removeLastBird: removeLastBird,
      updateAll:      updateAll,
      updateAllSimd:  updateAllSimd,
      posOf:          posOf,
      dumpOne:        dumpOne
    };

  }();

  
  var surface = function() {
  
    var useCanvas = false;
    var ctx;
    var domNode;
    
    var sprites         = [];
    var spritePositions = [];

    function init(domElem) {
      if ($(domElem).prop("tagName") === "CANVAS") {
        useCanvas = true;
        ctx = domElem.getContext("2d");
        $(domElem).attr("width", config.surfaceWidth);
        $(domElem).attr("height", config.surfaceHeight);
      }
      else {
        domNode = domElem;
        $(domNode).css("width", config.surfaceWidth);
        $(domNode).css("height", config.surfaceHeight);
        $(domNode).css("position", "absolute");
      }
    }
    
    function createCanvasSprite(width, height, rgbaData) {
      var sprite      = ctx.createImageData(width, height);
      var blankSprite = ctx.createImageData(width, height);
      var spriteData = sprite.data;
      var blankSpriteData = blankSprite.data;
      
      var len  = width*height*4;
      for (var i = 0; i < len; i+=4) {
        spriteData[i]   = rgbaData[i];
        spriteData[i+1] = rgbaData[i+1];
        spriteData[i+2] = rgbaData[i+2];
        spriteData[i+3] = rgbaData[i+3];
        blankSpriteData[i] = 255;
        blankSpriteData[i+1] = 255;
        blankSpriteData[i+2] = 255;
        blankSpriteData[i+3] = 255;
      }
      sprites.push({sprite: sprite, blankSprite: blankSprite});
      return sprites.length - 1;
    }
  
    function createDomSprite(width, height, rgbaData) {
      var $canvas = $("<canvas>");
      $canvas.attr("width", width);
      $canvas.attr("height", height);
      var canvasCtx = $canvas[0].getContext("2d");
      var canvasSprite = canvasCtx.createImageData(width, height);
      var canvasSpriteData = canvasSprite.data;
      for (var i = 0, n = width*height*4; i < n; i += 4) {
        canvasSpriteData[i] = rgbaData[i];
        canvasSpriteData[i+1] = rgbaData[i+1];
        canvasSpriteData[i+2] = rgbaData[i+2];
        canvasSpriteData[i+3] = rgbaData[i+3];
      }
      canvasCtx.putImageData(canvasSprite, 0, 0);
      var $img = $("<img>").attr("src", $canvas[0].toDataURL("image/png"));
      $img.css("position", "absolute");
      sprites.push({img: $img});
      return sprites.length - 1;
    }

    function createImageSprite(imageSrc) {
      if (useCanvas) {
        logger.error("Cannot create canvas image sprite");
        return 0;
      }
      else {
        var $img = $("<img>").attr("src", imageSrc);
        $img.css("position", "absolute");
        sprites.push({img: $img});
        return sprites.length - 1;
      }
    }
    
    function createSprite(width, height, rgbaData) {
      if (useCanvas) {
        return createCanvasSprite(width, height, rgbaData);
      }
      else {
        return createDomSprite(width, height, rgbaData);
      }
    }
    
    function placeCanvasSprite(spriteId, x, y) {
      spritePositions.push({spriteId: spriteId, x: x, y: y});
      ctx.putImageData(sprites[spriteId].sprite, x, y);
      return spritePositions.length - 1;
    }
    
    function placeDomSprite(spriteId, x, y) {
      var $img = sprites[spriteId].img;
      var $imgClone = $img.clone();
      var imgClone  = $imgClone[0];
      domNode.appendChild(imgClone);
      imgClone.style.left = x + "px";
      imgClone.style.top  = y + "px";
//      $imgClone.css({left:x, top:y});
      spritePositions.push({img: $imgClone, x: x, y: y});
      return spritePositions.length - 1;
    }

    function placeSprite(spriteId, x, y) {
      if (useCanvas) {
        return placeCanvasSprite(spriteId, x, y);
      }
      else {
        return placeDomSprite(spriteId, x, y);
      }
    }

    function moveCanvasSprite(posId, x, y) {
      var spritePos = spritePositions[posId]; 
      var sprite    = sprites[spritePos.spriteId];
      ctx.putImageData(sprite.blankSprite, spritePos.x, spritePos.y);
      spritePos.x = x;
      spritePos.y = y;
      ctx.putImageData(sprite.sprite, x, y);
    }

    function moveDomSprite(posId, x, y) {
      var spritePos = spritePositions[posId]; 
      var $img = spritePos.img;
      var img = $img[0];
      spritePos.x = x;
      spritePos.y = y;
//      $img.css({left:x, top:y});
      img.style.left = x + "px";
      img.style.top  = y + "px";
    }
    
    function moveSprite(posId, x, y) {
      if (useCanvas) {
        moveCanvasSprite(posId, x, y);
      }
      else {
        moveDomSprite(posId, x, y);
      }
    }

    function removeLastCanvasSprite() {
      var spritePos = spritePositions[spritePositions.length-1];
      var sprite    = sprites[spritePos.spriteId];
      ctx.putImageData(sprite.blankSprite, spritePos.x, spritePos.y);
      spritePositions.pop();
    }

    function removeLastDomSprite() {
      var spritePos = spritePositions[spritePositions.length-1];
      spritePos.img.remove();
      spritePositions.pop();
    }
    
    function removeLastSprite() {
      if (useCanvas) {
        removeLastCanvasSprite();
      }
      else {
        removeLastDomSprite();
      }
    }
    
    function posOf(posId) {
      return spritePositions[posId];
    }
    
    return {
      init:              init,
      createSprite:      createSprite,
      createImageSprite: createImageSprite,
      placeSprite:       placeSprite,
      moveSprite:        moveSprite,
      removeLastSprite:  removeLastSprite,
      posOf:             posOf
    };
      
  }();


  // keep track of the FPS

  var fpsAccounting = function() {

    var targetFps         = 30.0;
    var targetFpsMax      = 30.5;
    var targetFpsMin      = 29.5;
    var frameCountMax     = 10;
    var frameCount        = 0;
    var startTime         = 0.0;
    var currentFpsValue;

    function adjustCount(actual, target, totalCount) {
      var diff = Math.abs(actual - target);
      if (diff > 20.0) {
        return Math.ceil(totalCount/2);
      }
      else if (diff > 10.0) {
        return Math.ceil(totalCount/3);
      }
      else if (diff > 5.0) {
        return Math.ceil(totalCount/4);
      }
      else if (diff > 2.0) {
        return Math.ceil(totalCount/5);
      }
      else {
        return 1;
      }      
    }

    // called for each frame update
    function adjustBirds(time, bird, totalCount, addBirds, removeBirds) {
      var adjustmentMade = false;
      if (frameCount === 0) {
        startTime = time;
        frameCount++;
      }
      else if (frameCount < frameCountMax) {
        frameCount++;
      }
      else { // frameCount == frameCountMax
        var delta = time - startTime;
        var fps   = 1000.0*frameCountMax/delta;
        currentFpsValue = fps;        
        if (fps > targetFpsMax) {
          addBirds(bird, adjustCount(fps, targetFps, totalCount));
          adjustmentMade = true;
        }
        else if (fps < targetFpsMin) {
          removeBirds(adjustCount(fps, targetFps, totalCount));
          adjustmentMade = true;
        }
        startTime  = time;
        frameCount = 1;
      }
      return adjustmentMade;
    }

    function currentFps(time) {
      return currentFpsValue;
    }

    return {
      currentFps:  currentFps,
      adjustBirds: adjustBirds
    }
  }();


  function animateBirds() {

    var animate      = false;
    var useSimd      = false;
  
    var birdSprite;
    var birdSpriteBase;
    var birdSpriteSimd;
    var allBirds     = [];
    var lastTime     = Date.now();
    var $fps         = $("#fps");
    var $birds       = $("#birds");
    var lastTime     = 0.0;

    function randomY() {
      return Math.floor(Math.random()*config.surfaceHeight);
    }

    function randomX() {
      return Math.floor(Math.random()*config.surfaceWidth);
    }
    
    function addBird(birdSprite) {
      var y = randomY();
      var x = randomX();
      var birdId   = birds.addBird(y, y/10.0);
      var spriteId = surface.placeSprite(birdSprite, x, y);
      allBirds.push({birdId: birdId, spriteId: spriteId, startX: x, startY: y});
    }
    
    function removeLastBird() {
      if (allBirds.length > 0) {
        birds.removeLastBird();
        surface.removeLastSprite();
        allBirds.pop();
      }
    }
    
    function addBirds(bird, count) {
      for (var i = 0; i < count; ++i) {
        addBird(bird);
      }
    }

    function removeBirds(count) {
      for (var i = 0; i < count; ++i) {
        removeLastBird();
      }
    }

    function blackDotSprite(width, height) {
      var rgbaValues = new Uint8ClampedArray(width*height*4);
      for (var i = 0, n = width*height*4; i < n; i += 4) {
        rgbaValues[i] = 0;
        rgbaValues[i+1] = 0;
        rgbaValues[i+2] = 0;
        rgbaValues[i+3] = 255;
      }
      return surface.createSprite(width, height, rgbaValues);
    }

    function startStopClick() {
      var button = $("#startStop");
      if (animate) {
        button.val("Start");
        animate = false;
      }
      else {
        button.val("Stop");
        animate = true;
        lastTime = 0.0;
        moveAll();
      }
    }

    function useSimdClick() {
      var button = $("#useSimd");
      if (useSimd) {
        birdSprite = birdSpriteBase;
        useSimd = false;
        button.val("SIMD On");
      }
      else {
        birdSprite = birdSpriteSimd;
        useSimd = true;
        button.val("SIMD Off");
      }
    }

    // main animation function.  One new frame is created and the next one is requested

    function moveAll(time) {
      if (animate) {
        requestAnimationFrame(moveAll);
      }

      if (typeof time === "undefined") {
        return;
      }

      if (fpsAccounting.adjustBirds(time, birdSprite, allBirds.length, addBirds, removeBirds)) {
        $fps.text(fpsAccounting.currentFps().toFixed(2));
        $birds.text(allBirds.length);
      }

      if (lastTime !== 0.0) {
        if (useSimd) {
          birds.updateAllSimd(time - lastTime);
        }
        else {
          birds.updateAll(time - lastTime);
        }
      }
      lastTime = time;

      for (var i = 0; i < allBirds.length; ++i) {
        var bird = allBirds[i];
        var pos = birds.posOf(bird.birdId);
        surface.moveSprite(bird.spriteId, bird.startX, pos);
      }
    }

    birds.init(config.surfaceHeight);

//    birdSprite = blackDotSprite(5, 5);
    birdSpriteBase = surface.createImageSprite("fbird.png");
    birdSpriteSimd = surface.createImageSprite("fbird2.png");
    birdSprite     = birdSpriteBase;
    $("#canvasSurface").hide();
//    surface.init($("#canvasSurface")[0]);
    surface.init($("#domSurface")[0]);
    addBirds(birdSprite, 5);
    $("#startStop").click(startStopClick);    
    $("#useSimd").click(useSimdClick);
    if (animate) {
      moveAll();
    }
  }

  function testBirds() {
    var updates = 10;

    function addAllBirds() {
      birds.init(1000.0);
      for (var i = 0; i < config.maxBirds; ++i) {
        birds.addBird(500.0, 100.0);
      }
    }

    $("#canvasSurface").hide();
    $("#domSurface").hide();

    addAllBirds();
    var start = Date.now();
    for (var i = 0; i < updates; ++i) {
      birds.updateAll(0.016);
    }
    var stop = Date.now();
    logger.trace("Time per update: " + (stop - start)/updates + "ms");
    for (var i = 0; i < 4; ++i) {
      birds.dumpOne(i+4);
    }
    if (typeof SIMD !== "undefined") {
      addAllBirds();
      var start = Date.now();
      for (var i = 0; i < updates; ++i) {
        birds.updateAllSimd(0.016);
      }
      var stop = Date.now();
      logger.trace("Time per update: " + (stop - start)/updates + "ms");
      for (var i = 0; i < 4; ++i) {
        birds.dumpOne(i+4);
      }
    }
  }
  
  function main() {
    logger.trace("main");
    animateBirds();
//    testBirds();
  }

  $(main);
}());