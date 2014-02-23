// Author: Peter Jensen
(function() {

  // configuration
  var config = {
    canvasWidth:  1000,
    canvasHeight: 400,
    birdWidth:    10,
    birdHeight:   10,
    maxBirds:     100000
  };

  // module globals

  var logger = {
    traceEnabled: true,
    trace: function (msg) {
      console.log(msg);
    },
    traceDisable: function () {
      this.traceEnabled = false;
    },
    traceEnable: function () {
      this.traceEnabled = true;
    }
  }

  // Keep track of all the birds

  var birds = function () {

    var maxPos    = 1000.0;
    var posArray  = new Float32Array(config.maxBirds);
    var velArray  = new Float32Array(config.maxBirds);

    var accelData = {
      interval:  0.1,  // time in millis seconds for each accel value
      values:   [10.0, 9.0, 8.0, 7.0, 6.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0]
    }
    
    var actualBirds = 0;

    function clearAll() {
      actualBirds = 0;
    }
        
    function addBird(pos, vel) {
      if (actualBirds >= config.maxBirds) {
        logger.trace("maxBirds exceeded");
        return;
      }
      posArray[actualBirds] = pos;
      velArray[actualBirds] = vel;
      actualBirds++;
    }

    function updateAll(timeDelta) {
      var steps               = Math.ceil(1000.0*timeDelta/accelData.interval);
      var accelCount          = accelData.values.length;
      var subTimeDelta        = timeDelta/steps;
      var subTimeDeltaSquared = subTimeDelta*subTimeDelta;
      for (var i = 0; i < actualBirds; ++i) {
        var accelIndex          = 0;
        var newPos = posArray[i];
        var newVel = velArray[i];
        for (var a = 0; a < steps; ++a) {
          var accel = accelData.values[accelIndex];
          accelIndex = (accelIndex + 1) % accelCount;
          var posDelta = accel*subTimeDeltaSquared + newVel*subTimeDelta;
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
      var steps = Math.ceil(1000.0*timeDelta/accelData.interval);
      var accelCount = accelData.values.length;
      var subTimeDelta = timeDelta/steps;

      var posArrayx4         = new Float32x4Array(posArray.buffer);
      var velArrayx4         = new Float32x4Array(velArray.buffer);
      var maxPosx4           = SIMD.float32x4.splat(maxPos);
      var subTimeDeltax4        = SIMD.float32x4.splat(subTimeDelta);
      var subTimeDeltaSquaredx4 = SIMD.float32x4.mul(subTimeDeltax4, subTimeDeltax4);

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
          posDeltax4 = SIMD.float32x4.mul(accelx4, subTimeDeltaSquaredx4);
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

    function setAccelData(accelData) {
      
    }

    function dumpOne(index) {
      logger.trace(index + ". pos:" + posArray[index] + ", vel:" + velArray[index]);
    }

    return {
      clearAll:      clearAll,
      addBird:       addBird,
      updateAll:     updateAll,
      updateAllSimd: updateAllSimd,
      dumpOne:       dumpOne
    };

  }();

  
  var canvas = function() {
  
    var ctx;
    
    var sprites         = [];
    var spritePositions = [];

    function init(canvasElem) {
      $(canvasElem).attr("width", config.canvasWidth);
      $(canvasElem).attr("height", config.canvasHeight);
      ctx = canvasElem.getContext("2d");
    }
    
    function createSprite(width, height, rgbaData) {
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
  
    function placeSprite(spriteId, x, y) {
      spritePositions.push({spriteId: spriteId, x: x, y: y});
      ctx.putImageData(sprites[spriteId].sprite, x, y);
      return spritePositions.length - 1;
    }

    function moveSprite(posId, x, y) {
      var spritePos = spritePositions[posId]; 
      var sprite    = sprites[spritePos.spriteId];
      ctx.putImageData(sprite.blankSprite, spritePos.x, spritePos.y);
      spritePos.x = x;
      spritePos.y = y;
      ctx.putImageData(sprite.sprite, x, y);
    }

    function removeLastSprite() {
      var spritePos = spritePositions[spritePositions.length-1];
      var sprite    = sprites[spritePos.spriteId];
      ctx.putImageData(sprite.blankSprite, spritePos.x, spritePos.y);
      spritePositions.pop();
    }
    
    function posOf(posId) {
      return spritePositions[posId];
    }
    
    return {
      init:             init,
      createSprite:     createSprite,
      placeSprite:      placeSprite,
      moveSprite:       moveSprite,
      removeLastSprite: removeLastSprite,
      posOf:            posOf
    };
      
  }();
  
  function animateBirds() {
  
    var targetFps         = 30.0;
    var targetFpsMin      = 32.0;
    var targetFpsMax      = 28.0;
    var frameAverageCount = 10;
    
    var birdSprite;
    var birds        = [];
    var animate      = true;
    var lastTime     = Date.now();
    var $fps         = $("#fps");
    var $birds       = $("#birds");
    var frameCount   = 0;
    var startTime;

    function randomY() {
      return Math.floor(Math.random()*config.canvasHeight);
    }

    function randomX() {
      return Math.floor(Math.random()*config.canvasWidth);
    }
    
    function addBird(birdSprite) {
      birds.push({id: canvas.placeSprite(birdSprite, randomX(), randomY()), vel: 1});
    }
    
    function removeLastBird() {
      if (birds.length > 0) {
        canvas.removeLastSprite();
      }
      birds.pop();
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
      
    function moveAll(time) {
      if (animate) {
        requestAnimationFrame(moveAll);
      }
      if (frameCount === 0) {
        startTime = time;
        frameCount++;
      }
      else if (frameCount === frameAverageCount) {
        var delta = time - startTime;
        var fps   = frameCount*1000.0/delta;
        if (fps < targetFpsMin) {
          removeBirds(1);
        }
        else if (fps > targetFpsMax) {
          var fpsDelta = fps - targetFps;
          var newBirdCount;
          if (fpsDelta > 10.0) {
            newBirdCount = 10;
          }
          else if (fps > 5.0) {
            newBirdCount = 5;
          }
          else {
            newBirdCount = 1;
          }
          addBirds(birdSprite, newBirdCount);
        }
        $fps.text(fps.toFixed(2));
        $birds.text(birds.length);
        frameCount = 0;
      }
      else {
        frameCount++;
      }
      
      for (var i = 0; i < birds.length; ++i) {
        var bird = birds[i];
        var pos = canvas.posOf(bird.id);
        var vel = bird.vel;
        if (vel > 0 && pos.y < config.canvasHeight) {
          canvas.moveSprite(bird.id, pos.x, pos.y+vel);
        }
        else if (vel < 0 && pos.y > 0) {
          canvas.moveSprite(bird.id, pos.x, pos.y+vel);
        }
        else {
          bird.vel = -bird.vel;
        }
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
      return canvas.createSprite(width, height, rgbaValues);
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
        moveAll();
      }
    }
    
    canvas.init($("#canvas")[0]);
    birdSprite = blackDotSprite(5, 5);
    addBirds(birdSprite, 100);
    $("#startStop").click(startStopClick);    
    moveAll();
  }
  
  function main() {
    animateBirds();
    return;
    var updates = 10;
    logger.trace("main");
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
      birds.clearAll();
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
/*
    createBird();
    placeBird(200, 200);
    setTimeout(function() {
      removeBird(200, 200)
    }, 2000);
*/
  }

  $(main);
}());