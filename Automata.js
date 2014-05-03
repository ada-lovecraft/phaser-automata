'use strict';
var Utils = require('../plugins/utils');
var Primative = require('./primative');
var Automata = function(game, x, y, size, color, options) {
  Primative.call(this, game, x, y, size, color);
  this.options = _.merge({}, Automata.defaultOptions, _.defaults);
  this.setOptions(options);

  this.radius = Math.sqrt(this.height * this.height + this.width + this.width) / 2;

  this.graphics = this.game.add.graphics(0,0);

  this.edges = null; // set automatically by setOptions setter method
  this.renderDebug = new Automata.debug(this.graphics);
  // initialize your prefab here
  
};

Automata.prototype = Object.create(Primative.prototype);
Automata.prototype.constructor = Automata;

Automata.prototype.update = function() {
    if(this.options.enabled) {
    // write your prefab's specific update code here
    if(this.options.game.debug) {
      this.renderDebug.clear();
    }
    var accel = new Phaser.Point();

    _.every(this.priorityList, function(priority) {
      priority.continue = true;
      _.each(priority, function(behavior) {
        if(behavior.enabled) {
          accel.setTo(0,0);
          accel = behavior.method.call(this, behavior.target, behavior.viewDistance);
          if(accel.getMagnitude() > 0) {
            this.applyForce(accel, behavior.strength);
            priority.continue = false;
          }
        }
      }, this);
      return priority.continue;
    }, this);


    

    if(this.options.game.rotateToVelocity) {
      this.rotation = Math.atan2(this.body.velocity.y, this.body.velocity.x);
    }

    this.body.velocity.limit(this.options.forces.maxSpeed);
    if(this.options.game.debug) {
      this.renderDebug.velocity(this);
    }
  }
};

Automata.prototype.applyForce = function(force, strength) {
  var velocity;
  var limit = this.options.forces.maxForce * strength;
  force.limit(this.options.forces.maxForce * strength);
  velocity = Phaser.Point.add(this.body.velocity, force);
  this.body.velocity.add(velocity.x, velocity.y);
};



/** Behaviors **/

Automata.prototype.seek = function(target, viewDistance, isSeeking) {
  isSeeking = typeof isSeeking === 'undefined' ? true : isSeeking;

  var steer = new Phaser.Point();

  var tpos, pos, desired, distance;

  viewDistance = viewDistance || this.options.seek.viewDistance;

    if(target instanceof Function) {
      target = target();
    }
  
    if(target instanceof Phaser.Group || target instanceof Array) {
      target = this.getClosestInRange(target, viewDistance);
    }

    if(!!target) {
      

      if (target instanceof Phaser.Point) {
        tpos = target;
      } else {
        tpos = target.position;
      }

      pos = this.position;

      desired = Phaser.Point.subtract(tpos, pos);
      distance = desired.getMagnitude();

      if(distance > 0 && distance < viewDistance) {
        desired.normalize();
        if(isSeeking && this.options.seek.slowArrival && distance < this.options.seek.slowingRadius) {
          var m = Phaser.Math.mapLinear(distance,0, viewDistance,0, this.options.forces.maxSpeed);
          desired.scaleBy(m);
        } else {
          desired.scaleBy(this.options.forces.maxSpeed);
        }
        
        

        steer = Phaser.Point.subtract(desired, this.body.velocity);
      }
    }

  if(this.options.game.debug && isSeeking) {
    this.renderDebug.seek(this.position, tpos, viewDistance, steer.getMagnitude(), this.options.seek.slowingRadius, distance < this.options.seek.slowingRadius );  
  }

  return steer;
};

Automata.prototype.flee = function(target, viewDistance, isFleeing) {
  isFleeing = typeof isFleeing === 'undefined' ? true : isFleeing;
  viewDistance = viewDistance || this.options.flee.viewDistance;
  var steer = new Phaser.Point(), 
      desired;
  if(!!target) {
    if(target instanceof Function) {
      target = target();
    }
    if(target instanceof Phaser.Group || target instanceof Array) {
      target = this.getClosestInRange(target, viewDistance);
    }
    if (!!target) {
      desired = Phaser.Point.subtract(target, this.position);
      if (desired.getMagnitude() < viewDistance) {
        desired.normalize();
      
        desired.multiply(-this.options.forces.maxSpeed, -this.options.forces.maxSpeed);

        steer = Phaser.Point.subtract(desired, this.body.velocity);
      }
      if(this.options.game.debug && isFleeing) {
        this.renderDebug.flee(this.position, target, viewDistance, steer.getMagnitude());  
      }
    }
  }
  return steer;
};

Automata.prototype.pursue = function(target, viewDistance) {
  var steer = new Phaser.Point(),
      distance;
  if(!!target) {
    if(target instanceof Function) {
      target = target();
    }
    if(target instanceof Phaser.Group || target instanceof Array) {
      target = this.getClosestInRange(target, viewDistance);
    }
    if(!!target) {
      distance = Phaser.Point.distance(target, this.position);
      if(distance < viewDistance) {
        steer = this.seek(this.getFuturePosition(target), viewDistance, false);
      }
    }
  }

  if (this.options.game.debug) {
    this.renderDebug.pursue(this.position, !!target ? target.position : new Phaser.Point(), viewDistance, steer.getMagnitude());
  }

  return steer;
};

Automata.prototype.evade = function(target, viewDistance) {
  var steer = new Phaser.Point(),
    distance, targets, futurePosition;

  function comparator(a, b) {
    var da = Phaser.Point.distance(a, this.position);
    var db = Phaser.Point.distance(b, this.position);
    return da - db;
  }

  if(!!target) {
    if(target instanceof Function) {
      target = target();
    }
    if(target instanceof Phaser.Group || target instanceof Array) {
      targets = this.getAllInRange(target, viewDistance);
    } else {
      targets = [target];
    }

    targets.sort(comparator.bind(this));
    var targetCounter = 1;
    var totalDistance = 0;
    targets.forEach(function(t) {
      if (t) {
        distance = Phaser.Point.distance(t, this.position);
        steer = Phaser.Point.add(steer, this.flee(this.getFuturePosition(t), viewDistance, false).scaleBy(viewDistance / distance));
        totalDistance += distance;
        targetCounter++;
      }
    }, this);

    steer.divide(targetCounter, targetCounter);
    
  }

  if (this.options.game.debug) {
    this.renderDebug.evade(this.position, futurePosition ? [futurePosition] : targets, viewDistance, steer.getMagnitude());
  }
  return steer;
};

Automata.prototype.wander = function() {
  this.options.wander.theta += this.game.rnd.realInRange(-this.options.wander.change, this.options.wander.change);

  var circleLocation, steer, circleOffset;

  circleLocation = this.body.velocity.clone();
  circleLocation.normalize();
  circleLocation.scaleBy(this.options.wander.distance * this.radius);

  circleOffset = new Phaser.Point(this.options.wander.radius * this.radius * Math.cos(this.options.wander.theta),
                                  this.options.wander.radius * this.radius * Math.sin(this.options.wander.theta));

  steer = Phaser.Point.add(circleLocation, circleOffset);

  return steer.scaleBy(this.options.wander.strength);
  
};

Automata.prototype.getAllInRange = function(targets, viewDistance) {
  var inRange = [], difference;

  targets.forEachExists(function(target) {
    difference = Phaser.Point.subtract(target.position, this.position);
    if(difference.getMagnitude() < viewDistance) {
      inRange.push(target);
    }
  }, this);

  return inRange;
};

Automata.prototype.getClosestInRange = function(targetGroup, viewDistance) {
  var closestTarget = null;
  var closestDistance = viewDistance;

  if(!targetGroup) {
    return null;
  }

  targetGroup.forEachExists(function(target) {
    if(target instanceof Phaser.Group) {
      target = this.getClosestInRange(target);
    }
    var d;
    d = this.position.distance(target.position);

    if(d < closestDistance) {
      closestDistance = d;
      closestTarget = target;
    }
  }, this);

  return closestTarget;
};

Automata.prototype.getFuturePosition = function(target) {
  var difference, distance, time, targetPosition,
      tpos = target.position, pos = this.position;

  difference = Phaser.Point.subtract(tpos, pos);
  distance = difference.getMagnitude();
  if (!!target.body.velocity.getMagnitude()) {
    time = distance / target.body.velocity.getMagnitude();
    targetPosition = Phaser.Point.multiply(target.body.velocity, new Phaser.Point(time,time));
    targetPosition.add(tpos.x, tpos.y);
  } else {
    targetPosition = tpos;
  }

  return targetPosition;
};


/** Flocking **/
Automata.prototype.flock = function() {
  var steer = new Phaser.Point();
  this.applyForce(this.separate());
  this.applyForce(this.align());
  this.applyForce(this.cohesion());
  return steer;
};

Automata.prototype.separate = function() {
  var steer = new Phaser.Point();
  var count = 0;

  this.options.flocking.flock.forEachExists(function(Automata) {
    var d = this.position.distance(Automata.position);

    if((d > 0) && (d < this.options.flocking.separation.desiredSeparation)) {
      var diff = Phaser.Point.subtract(this.position, Automata.position);
      diff.normalize();
      diff.divide(d,d);
      steer.add(diff.x,diff.y);
      count++;
    }
  }, this);

  if(count > 0) {
    steer.divide(count, count);
  }

  if(steer.getMagnitude() > 0) {
    steer.normalize();
    steer.multiply(this.options.forces.maxSpeed, this.options.forces.maxSpeed);
    steer.subtract(this.body.velocity.x, this.body.velocity.y);
    steer.setMagnitude(this.options.flocking.separation.strength);
  }

  return steer;
};

Automata.prototype.align = function() {
  var sum = new Phaser.Point();
  var steer = new Phaser.Point();
  var count = 0;
  this.options.flocking.flock.forEach(function(Automata) {
    var d = this.position.distance(Automata.position);
    if ((d > this.options.flocking.minDistance) && d < this.options.flocking.maxDistance) {
      sum.add(Automata.body.velocity.x, Automata.body.velocity.y);
      count++;
    }
  }, this);

  if (count > 0) {
    sum.divide(count, count);  

    sum.normalize();
    sum.multiply(this.options.forces.maxSpeed, this.options.forces.maxSpeed);
    steer = Phaser.Point.subtract(sum, this.body.velocity);
    steer.setMagnitude(this.options.flocking.alignment.strength);
  }

  return steer;
};

Automata.prototype.cohesion = function() {
  
  var sum = new Phaser.Point();
  var steer = new Phaser.Point();
  var count = 0;

  this.options.flocking.flock.forEach(function(Automata) {
    var d = Phaser.Point.distance(this.position, Automata.position);
    if ((d > 0) && d < this.options.flocking.maxDistance) {
      sum.add(Automata.position.x, Automata.position.y);
      count++;
    }
  }, this);

  if (count > 0) {
    sum.divide(count, count);  
    steer = Phaser.Point.subtract(sum, this.position);
    steer.normalize().setMagnitude(this.options.flocking.cohesion.strength);
    return steer;
    //return this.seek(sum)
  }
  return steer;
};






Automata.prototype.checkBounds = function() {
  var steer = new Phaser.Point();
  if(this.options.game.wrapWorldBounds === true) {
    if(this.position.x < this.edges.left ){
      this.position.x = this.game.width + this.radius;
    }
    if(this.position.y < this.edges.top ){
      this.position.y = this.game.height + this.radius;
    }
    if(this.position.x > this.edges.right ){
      this.position.x = -this.radius;
    }
    if(this.position.y > this.edges.bottom ){
      this.position.y = -this.radius;
    }
  } else {
    var desired = new Phaser.Point();

    if (this.position.x < this.options.game.edgeWidth) {
      desired = new Phaser.Point(this.options.forces.maxSpeed, this.body.velocity.y);
    } 
    else if (this.position.x > this.game.width - this.options.game.edgeWidth) {
      desired = new Phaser.Point(-this.options.forces.maxSpeed, this.body.velocity.y);
    } 

    if (this.position.y < this.options.game.edgeWidth) {
      desired = new Phaser.Point(this.body.velocity.x, this.options.forces.maxSpeed);
    } 
    else if (this.position.y > this.game.height - this.options.game.edgeWidth) {
      desired = new Phaser.Point(this.body.velocity.x, -this.options.game.edgeWidth);
    } 

    steer = desired;
  }
  return steer;
};

Automata.prototype.setOptions = function(options) {
  this._options = _.merge(this.options, options);
  this.priorityList = _.chain(this.options)
  .groupBy('priority')
  .map(function(element, key, obj) {
    obj[key].id = parseInt(key);
    return obj[key];
  }).value();

  this.priorityList.sort(function(a,b) {
    return a.id - b.id;
  });

  if(this.options.game.wrapWorldBounds === false) {
    this.edges = {
      left: this.options.game.edgeWidth,
      right: this.game.width - this.options.game.edgeWidth,
      top: this.options.game.edgeWidth,
      bottom: this.game.height - this.options.game.edgeWidth
    };
  } else {
    this.edges = {
      left: -this.radius,
      right: this.game.width + this.radius,
      top: -this.radius,
      bottom: this.game.height + this.radius
    };
  }
};


Automata.defaultOptions = Object.freeze({
  enabled: true,
  game: {
    wrapWorldBounds: true,
    rotateToVelocity: true,
    edgeWidth: 25,
    debug: false
  },
  
  forces: {
    maxSpeed: 100.0,
    maxForce: 100.0
  },
  checkBounds: {
    name: 'checkBounds',
    enabled: true,
    priority: 0,
    strength: 1,
    method: Automata.prototype.checkBounds
  },
  flocking: {
    name: 'flocking',
    enabled: false,
    maxDistance: 200.0,
    minDistance: 50.0,
    separation: {
      strength: 1.0,
      desiredSeparation: 50.0
    },
    alignment: {
      strength: 1.0
    },
    cohesion: {
      strength: 1.0,
    },
    flock: null,
    priority: 1,
    method: Automata.prototype.flock
  },
  seek: {
    name: 'seek',
    enabled: false,
    target: null,
    strength: 1.0,
    slowArrial: false, 
    slowingRadius: 10,
    viewDistance: Number.MAX_VALUE,
    priority: 2,
    method: Automata.prototype.seek
  },
  flee: {
    name: 'flee',
    enabled: false,
    target: null,
    strength: 1.0,
    viewDistance: Number.MAX_VALUE,
    priority: 1,
    method: Automata.prototype.flee
  },
  pursue: {
    name: 'pursue',
    enabled: false,
    target: null,
    strength: 1.0,
    viewDistance: Number.MAX_VALUE,
    priority: 1,
    method: Automata.prototype.pursue
  },
  evade: {
    name: 'evade',
    enabled: false,
    target: null,
    strength: 1.0,
    viewDistance: Number.MAX_VALUE,
    priority: 1,
    method: Automata.prototype.evade
  },
  wander: {
    name: 'wander',
    enabled: false,
    strength: 1.0,
    distance: 3.5,
    radius: 3.0,
    theta: 0,
    change: 0.3,
    priority: 6,
    method: Automata.prototype.wander
  }
});



Automata.debug = function(graphics) {
  this.graphics = graphics;

  this.game = this.graphics.game;

  this.actionLabel = this.game.add.text(0,0,'');
  this.actionLabel.anchor.setTo(0.5, 0.5);
  this.actionLabel.fontSize = 12;
  this.actionLabel.font = 'Helvetica';

  this.distanceLabel = this.game.add.text(0,0,'');
  this.distanceLabel.anchor.setTo(0.5, 0.5);
  this.distanceLabel.fontSize = 12;
  this.distanceLabel.font = 'Helvetica';

};

Automata.debug.prototype = Object.create({ 
  setLabel: function(position, text, distance, color, alpha) {
    color = Utils.hexToColorString(color);
    alpha = alpha || 1;

    this.actionLabel.x = position.x;
    this.actionLabel.y = position.y + 50;

    this.actionLabel.x = position.x;
    this.actionLabel.y = position.y + 65;


    this.actionLabel.setText(text);
    this.actionLabel.fill = color;
    this.actionLabel.alpha = alpha;

    this.distanceLabel.setText(distance);
    this.distanceLabel.fill = color;
    this.distanceLabel.alpha = alpha;
  },
  velocity: function(automata) {
    var line = new Phaser.Point(automata.x + automata.body.velocity.x, automata.y + automata.body.velocity.y)
    this.graphics.lineStyle(2, 0x000000,1);
    this.graphics.moveTo(automata.x, automata.y);
    this.graphics.lineTo(line.x, line.y);
    this.fill(0x000000,1, true, function() {
      this.graphics.drawCircle(line.x, line.y, 3);
    });
  },
  seek: function(position, target, viewDistance, active, slowingRadius, slowActive, color, alpha) {

    active = !!active;
    color = color || 0x89b7fd;
    alpha = alpha || 0.25;
    

    this.drawSensorRange(position, viewDistance, active, color, alpha);
    if (slowingRadius) {
      this.drawSensorRange(position, slowingRadius, slowActive, color, alpha);
    }
    if(active) {
      this.drawLineToTarget(position, target);
      this.setLabel(position, 'seeking', Phaser.Point.distance(position, target).toFixed(2), color, alpha);
    }

  },
  pursue: function(position, target, viewDistance, active, color, alpha) {

    active = !!active;
    color = color || 0x89fdbd;
    alpha = alpha || 0.25;
    

    this.drawSensorRange(position, viewDistance, active, color, alpha);
    if(active) {
      this.drawLineToTarget(position, target);
      this.setLabel(position, 'pursuing', Phaser.Point.distance(position, target).toFixed(2), color, alpha);
    }

  },
  flee: function(position, target, viewDistance, active, color, alpha) {

    active = !!active;
    color = color || 0xfd89fc;
    alpha = alpha || 0.25;
  
    
    this.drawSensorRange(position, viewDistance, active, color, alpha);

    if(active) {
      this.drawLineToTarget(position, target);
      this.setLabel(position, 'fleeing', Phaser.Point.distance(position, target).toFixed(2), color, alpha);
    }
  },
  evade: function(position, targets, viewDistance, active, color, alpha) {

    active = !!active;
    color = color || 0xff0000;
    alpha = alpha || 0.25;
  
    
    this.drawSensorRange(position, viewDistance, active, color, alpha);

    if(active) {
      targets.forEach(function(target) {
        this.drawLineToTarget(position, target);  
      }, this);
      
      this.setLabel(position, 'evading', Phaser.Point.distance(position, targets[0]).toFixed(2), color, alpha);
    }
    
  },
  bounds: function(edgeWidth, active) {
    this.fill(0x999999, 1, active, function() {

      var x1 = edgeWidth;
      var x2 = this.game.width - edgeWidth;
      var y1 = edgeWidth;
      var y2 = this.game.height - edgeWidth;

      this.graphics.moveTo(x1,y1);
      this.graphics.lineTo(x2, y1);
      this.graphics.lineTo(x2, y2);
      this.graphics.lineTo(x1, y2);
      this.graphics.lineTo(x1,y1);
    });
  },
  drawSensorRange: function(position, viewDistance, active, color, alpha) {
    this.fill(color, alpha, active, function() {
      this.graphics.drawCircle(position.x, position.y, viewDistance);
    });
  },
  drawLineToTarget: function(position, target) {
    this.graphics.moveTo(position.x, position.y);
    this.graphics.lineTo(target.x, target.y);
  },
  fill: function(color, alpha, active, method) {
    this.graphics.lineStyle( 1, color, alpha);
    if(active) {
      this.graphics.beginFill(color, alpha);
    }
    method.call(this);
    if(active) {
      this.graphics.endFill();
    }
  },
  clear: function() {
    this.graphics.clear();
    this.actionLabel.setText('');
    this.distanceLabel.setText('');
  }
});

Automata.debug.constructor = Automata.debug;


module.exports = Automata;
