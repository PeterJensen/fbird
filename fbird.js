// Author: Peter Jensen
(function() {

  // configuration
  var config = {
    canvasWidth:  600,
    canvasHeight: 400,
    birdWidth:     10,
    birdHeight:    10,
    maxBirds:  10000
  };

  // module globals
  var ctx = $("#canvas")[0].getContext("2d");
  var bird;
  var blank;
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

  function createBird() {
    bird  = ctx.createImageData(config.birdWidth, config.birdHeight);
    blank = ctx.createImageData(config.birdWidth, config.birdHeight);
    var birdData = bird.data;
    var blankData = blank.data;
    var len  = config.birdWidth*config.birdHeight*4;
    for (var i = 0; i < len; i+=4) {
      birdData[i] = 0;
      birdData[i+1] = 0;
      birdData[i+2] = 0;
      birdData[i+3] = 255;
      blankData[i] = 255;
      blankData[i+1] = 255;
      blankData[i+2] = 255;
      blankData[i+3] = 255;
    }
  }

  function placeBird(x, y) {
    ctx.putImageData(bird, x, y);
  }

  function removeBird(x, y) {
    ctx.putImageData(blank, x, y);
  }

  var birds = function () {

    var accel    = 10.0;
    var maxPos   = 1000.0;
    var posArray = new Float32Array(config.maxBirds);
    var velArray = new Float32Array(config.maxBirds);
    
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
      for (var i = 0; i < actualBirds; ++i) {
        var pos;
        var vel;
        var newPos;
        var newVel;
//        pos = 1.2;
//        vel = 3.4;
        pos = posArray[i];
        vel = velArray[i];
        newPos = pos;
        newVel = vel;
        newPos = accel*timeDelta*timeDelta + vel*timeDelta + pos;
        newVel = accel*timeDelta + vel;
        if (newPos > maxPos) {
          newPos = pos;
          newVel = -vel;
        }
        posArray[i] = newPos;
        velArray[i] = newVel;
      }
    }    

    function updateAllSimd(timeDelta) {
      var posArrayx4         = new Float32x4Array(posArray.buffer);
      var velArrayx4         = new Float32x4Array(velArray.buffer);
      var accelx4            = SIMD.float32x4.splat(accel);
      var timeDeltax4        = SIMD.float32x4.splat(timeDelta);
      var timeDeltaSquaredx4 = SIMD.float32x4.mul(timeDeltax4, timeDeltax4);
      var maxPosx4           = SIMD.float32x4.splat(maxPos);
      for (var i = 0, len = (actualBirds+3)>>2; i < len; ++i) {
        var posx4;
        var velx4;
        var newPosx4;
        var newVelx4;
//        posx4 = SIMD.float32x4.splat(1.2);
//        velx4 = SIMD.float32x4.splat(3.4);
        posx4 = posArrayx4.getAt(i);
        velx4 = velArrayx4.getAt(i);
        newPosx4 = posx4;
        newVelx4 = velx4;
        newPosx4 = SIMD.float32x4.add(posx4, SIMD.float32x4.mul(accelx4, timeDeltaSquaredx4));
        newPosx4 = SIMD.float32x4.add(newPosx4, SIMD.float32x4.mul(velx4, timeDeltax4));
        newVelx4 = SIMD.float32x4.add(velx4, SIMD.float32x4.mul(accelx4, timeDeltax4));
        var cmpx4 = SIMD.float32x4.greaterThan(newPosx4, maxPosx4);
        newVelTruex4 = SIMD.float32x4.neg(newVelx4);
        newPosx4 = SIMD.int32x4.select(cmpx4, posx4, newPosx4);
        newVelx4 = SIMD.int32x4.select(cmpx4, newVelTruex4, newVelx4);
        posArrayx4.setAt(i, newPosx4);
        velArrayx4.setAt(i, newVelx4);
      }
    }    

    function dumpOne(index) {
      logger.trace(index + ". pos:" + posArray[index] + ", vel:" + velArray[index]);
    }

    return {
      clearAll: clearAll,
      addBird: addBird,
      updateAll: updateAll,
      updateAllSimd: updateAllSimd,
      dumpOne: dumpOne
    };

  }();

  function addAllBirds() {
    for (var i = 0; i < config.maxBirds; ++i) {
      birds.addBird(0.0, 0.0);
    }
  }

  function main() {
    var updates = 10000;
    logger.trace("main");
    addAllBirds();
    var start = Date.now();
    for (var i = 0; i < updates; ++i) {
      birds.updateAll(0.0166);
    }
    var stop = Date.now();
    logger.trace("Time: " + (stop - start));
    for (var i = 0; i < 4; ++i) {
      birds.dumpOne(i);
    }
    if (typeof SIMD !== "undefined") {
      birds.clearAll();
      addAllBirds();
      var start = Date.now();
      for (var i = 0; i < updates; ++i) {
        birds.updateAllSimd(0.0166);
      }
      var stop = Date.now();
      logger.trace("Time: " + (stop - start));
      for (var i = 0; i < 4; ++i) {
        birds.dumpOne(i);
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