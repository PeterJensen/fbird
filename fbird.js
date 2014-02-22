// Author: Peter Jensen
(function() {

  // configuration
  var config = {
    canvasWidth:  600,
    canvasHeight: 400,
    birdWidth:    10,
    birdHeight:   10,
    maxBirds:     100000
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