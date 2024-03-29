//TODO: TTL slider
//TODO: Difficulty chooser
//TODO: distribute points evenly
//TODO: Automatic drawer?
//TODO: sections
//TODO: brush size
//TODO: export/import? (stačí setup.graphical.outputs)
//TODO: Obal okolo kicku miesto abs hodnoty
//TODO: masking, fft na rytmus?, derivácia nôt?, time eventing
//TODO: specific options?


//DONE: ten slider blbne
//DONE: noiser 7/10
//DONE: Eraser 3/10
//DONE: after end, the spotify data should refresh 1/10
//DONE: manual refresh button for spotify 1/1

//How does this work: The brushes are functions(config.graphical,called with where it will be located([mouseX, mouseY] or path))
// that return functions to array(config.output).
// The array elements are then called(objects,with xxxx).

/*-----------------------------*/

let out = (where => (...what) => {
  where.innerHTML = what;
  return what;
})(document.getElementById("out"));

let LOCAL = false;

/*-------------General Statistics and Geometry Functions----------------*/

let sum = (...a) => a.reduce((a, b) => a + b);
let mean = (...a) => sum(...a) / a.length;
let product = (...a) => a.reduce((a, b) => a * b);
let geoMean = (...a) => Math.abs(product(...a)) ** (1 / a.length);

let polarToCartesian = (middleX, middleY) => (radius, angle) => ({
  x: Math.sin(angle) * radius + middleX,
  y: Math.cos(angle) * radius + middleY
});
let polarToCartesianMidScreen = polarToCartesian(window.innerWidth / 2, window.innerHeight / 2);

/*-------------Spotify initializer----------------*/

let access_token;

function spotifyInitializer() {
  let stateKey = 'spotify_auth_state';

  /**
   * Obtains parameters from the hash of the URL
   * @return Object
   */
  function getHashParams() {
    let hashParams = {};
    let e, r = /([^&;=]+)=?([^&;]*)/g,
      q = window.location.hash.substring(1);
    while (e = r.exec(q)) {
      hashParams[e[1]] = decodeURIComponent(e[2]);
    }
    return hashParams;
  }

  /**
   * Generates a random string containing numbers and letters
   * @param  {number} length The length of the string
   * @return {string} The generated string
   */
  function generateRandomString(length) {
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array(length).fill(0).map(() => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
  }

  let params = getHashParams();
  let state, storedState;
  access_token = params["access_token"];
  state = params.state;
  storedState = localStorage.getItem(stateKey);
  if (access_token && (state == null || state !== storedState)) {
    alert('There was an error during the authentication');
  } else {
    localStorage.removeItem(stateKey);
    if (access_token) {
      let request = new XMLHttpRequest();
      request.open('GET', 'https://api.spotify.com/v1/me', true);
      request.setRequestHeader('Authorization', 'Bearer ' + access_token);
      request.onload = function () {
        if (this.status >= 200 && this.status < 400) {
          //userProfilePlaceholder.innerHTML = userProfileTemplate(this.response);
          document.getElementById('login').style.display = 'none';
          document.getElementById('loggedin').style.display = '';
        } else {
          console.log(this.error);

        }
      };
    } else {
      document.getElementById('login').style.display = '';
      document.getElementById('loggedin').style.display = 'none';
    }
    document.getElementById('login-button').addEventListener('click', function () {
      let client_id = 'c37229f0961e4f60863ee0cdda8b68f0'; // Your client id

      let redirect_uri = LOCAL?'http://localhost:63342/fourier/':"https://n4m3l355.github.io/fourier/"; // Your redirect uri
      let state = generateRandomString(16);
      localStorage.setItem(stateKey, state);
      let scope = 'user-read-private user-read-email user-read-currently-playing user-read-playback-state';
      let url = 'https://accounts.spotify.com/authorize';
      url += '?response_type=token';
      url += '&client_id=' + encodeURIComponent(client_id);
      url += '&scope=' + encodeURIComponent(scope);
      url += '&redirect_uri=' + encodeURIComponent(redirect_uri);
      url += '&state=' + encodeURIComponent(state);
      window.location = url;
    }, false);

  }
}

spotifyInitializer();

const spotifyApi = new SpotifyWebApi();
spotifyApi.setAccessToken(access_token);

/*-------------Working with curves and spectrum----------------*/

function lagrangeQuadraticInterpolation(points, x) {
  if (!points[0] || !points[1] || !points[2]) return 0;
  let x_1 = points[0][0], y_1 = points[0][1];
  let x_2 = points[1][0], y_2 = points[1][1];
  let x_3 = points[2][0], y_3 = points[2][1];
  return y_1 * (x - x_2) * (x - x_3) / ((x_1 - x_2) * (x_1 - x_3))
    + y_2 * (x - x_1) * (x - x_3) / ((x_2 - x_1) * (x_2 - x_3))
    + y_3 * (x - x_1) * (x - x_2) / ((x_3 - x_1) * (x_3 - x_2))
}

let getNearestIndexes = (array, where, n) => {      //optimalize
  return array.slice(Math.max(Math.round(where - n / 2), 0), Math.round(where + n / 2))
};

function Spectrum(smoothing, fourierPoints, pointsToAnalyze, pointsToShow) {
  this.smoothing = smoothing;		//makes sense from 3/4 to 23/24
  this.fourierPoints = fourierPoints;   //this needs to be 2^n
  this.samplingFrequency = 44100;         //this needs to be same as in operating system
  this.pointsToAnalyze = pointsToAnalyze;
  this.pointsToShow = pointsToShow;
  this.indexToHz = i => i * (this.samplingFrequency / 2) / this.fourierPoints;
  this.hzToIndex = hz => hz * this.fourierPoints / (this.samplingFrequency / 2);
  this.datapoints = [];
  this.tonalAmps = [];
  this.tonalSums = [];
  this.base = 110;
  this.step = 2 ** (1 / 12);
  this.octaves = 6;
  this.framesToAnalyze = 6 * 60;
  this.tonalFrequencies = Array(12 * this.octaves).fill(0).map((x, i) => this.base * (this.step ** (i)));
  this.getNearestPoints = (where, n) => getNearestIndexes(this.datapoints.map((x, i) => [i, x]), where, n);
  this.getInterpolatedAmp = (hz) => {
    return lagrangeQuadraticInterpolation(this.getNearestPoints(this.hzToIndex(hz), 3), this.hzToIndex(hz))
  };
  this.averageFrequencies = (fromHZ, toHZ) => {
    let avgs = mean(...this.datapoints.slice(this.hzToIndex(fromHZ), this.hzToIndex(toHZ)));
    return avgs;
  };
  this.getTonalAmps = () => this.tonalFrequencies.map((x) => [x, this.getInterpolatedAmp(x)]);
}

function SlidingArray(length, item = 0) {
  this.length = length;
  this.datapoints = Array(this.length).fill(item);
  this.index = 0;
  this.append = (x) => {
    this.datapoints[this.index] = x;
    this.index = (this.index + 1) % this.length;
  };
  this.get = () => [...this.datapoints.slice(this.index, this.length), ...this.datapoints.slice(0, this.index)];
}


/*-------------P5.js necessities----------------*/

P5 = p5;    //constructors should be uppercased
let config;

new P5((s) => {


  let isLooping = true;
  document.getElementById('toggleDrawing').addEventListener('click', () => {
    isLooping ? s.noLoop() : s.loop();
    isLooping = !isLooping;
    return false;
  });
  document.getElementById('eraseDrawing').addEventListener('click', () => {
    config.graphical.outputs = [];
    //livingObjects = [];
  });


  let mic;
  let fft;
  let lastSpectrumData;
  let spectrum = new Spectrum(27 / 32, 1024, 512, 512);
  let myScale = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"];
  let myScaleHues = [45, 300, 105, 0, 195, 30, 270, 60, 330, 150, 15, 240];

  let positions = {
    beatPosition: 0,
    tatumPosition: 0,
    barPosition: 0,
    segmentPosition: 0,
    sectionPosition: 0
  };
  let livingObjects = [];
  config = {};
  config.setup = {
    getCurrentOutput: () => document.getElementById('brushSelect').value,
    getCurrentColor: () => document.getElementById('color').value,
    getCurrentSymmetry: () => document.getElementById('symmetrySelect').value,
    getNoiseMultiplier: () => document.getElementById('noiseMultiplier').value
  };

  s.noisify = (v,n1,n2,shuffler=0, amount = (x) => x, densityFx = () => s.frameCount/384) => {
    return v+s.noise(
      densityFx()*(shuffler+1)+shuffler*100,
      (n1+densityFx())*(shuffler+2)/2,
      (n2+densityFx())*(shuffler+3)/3)*(amount(config.setup.getNoiseMultiplier())*2)-amount(config.setup.getNoiseMultiplier());
  };

  /*------------------Inputs for brushes-------------*/

  config.inputs = {
    beatPosition: {
      fx: (spectrum, positions) => positions.beatPosition
    },
    kick: {
      fx: (spectrum, positions) => spectrum.averageFrequencies(20,110)/255
    },
    snare: {
      fx: (spectrum, positions) => spectrum.averageFrequencies(4000,8000)/255
    },
    bassline: {
      fx: (spectrum, positions) => spectrum.averageFrequencies(110,220)/255
    },
    notes: {
      fx: (spectrum, positions) => {
        return spectrum.tonalFrequencies.map((x) => {
          let freqs = [spectrum.getInterpolatedAmp(x / (spectrum.step ** (1 / 2))),
            spectrum.getInterpolatedAmp(x * (spectrum.step ** (1 / 2))),
            spectrum.getInterpolatedAmp(x / (spectrum.step ** (1))),
            spectrum.getInterpolatedAmp(x * (spectrum.step ** (1)))];
          let firstTwo = mean(...freqs.sort((a, b) => b - a).slice(0, 2));
          return Math.max(0, spectrum.getInterpolatedAmp(x) - firstTwo) * (4096 / x);
        });
      }
    },
    energy: {
      fx: (spectrum, positions) => 0//spectrum.getEnergy()/255
    }
  };

  /*------------------Brushes-------------*/
  config.graphical = (s, objects) => ({


    brushes: {
      energy: (mouseBuffer) => mouseBuffer.map(([x, y]) => ({
        name: "pulses",
        input: () => config.inputValues.kick,
        fx: ((diameter,color) => v => {
          s.stroke(color);
          s.noFill();
          s.strokeWeight(1);
          //s.ellipse(x, y, (1 - Math.abs(1 - 2 * v)) ** 2 * 100)
          s.ellipse(s.noisify(x,x,y,21/23), s.noisify(y,y,x,17/19), Math.max(0, v*200+diameter));
        })(50+Math.random()*50, config.setup.getCurrentColor())
      })),
      pulses: (mouseBuffer) => mouseBuffer.map(([x, y]) => ({
        name: "pulses",
        input: () => config.inputValues.beatPosition,
        fx: ((diameter,color) => v => {
          s.stroke(color);
          s.noFill();
          s.strokeWeight(1);
          //s.ellipse(x, y, (1 - Math.abs(1 - 2 * v)) ** 2 * 100)
          s.ellipse(s.noisify(x,x,y,21/23), s.noisify(y,y,x,17/19), Math.max(0, diameter - 200 * v));
        })(300 * Math.random(), config.setup.getCurrentColor())
      })),
      path: (mouseBuffer) => mouseBuffer.map(([x, y], i, a) => ({
        name: "path",
        input: () => config.inputValues.beatPosition,
        fx: (color => v => {
          let increment;
          if (Math.abs(v * a.length - i) < 1) {
            increment = 50;
          } else {
            increment = 0;
          }
          s.stroke(color);
          s.noFill();
          if (i === 0) s.beginShape();
          s.vertex(s.noisify(x,x,y,25/27) + s.random(-increment, increment), s.noisify(y,x,y,27.29) + s.random(-increment, increment));
          if (i === a.length - 1) s.endShape();
        }
        )(config.setup.getCurrentColor())
      })),
      tonalEqualizer: (mouseBuffer) => mouseBuffer.map(([x, y], i, a) => ({
        name: "tonalEqualizer",
        input: () => config.inputValues.notes,
        fx: v => {    //z tohto chcem dať na každý úsek v.length/počet úsekov
          s.noFill();
          s.stroke(255);
          let items = v.slice(v.length / a.length * i, v.length / a.length * (i + 1));
          let f = {x, y};
          if (!a[i + 1]) return;
          let d = ((p) => ({x: p[0] - f.x, y: p[1] - f.y}))(a[i + 1]);
          items.forEach((x, j) => {
            s.stroke(myScaleHues[(Math.floor(v.length / a.length * i) + j) % 12], 100, 100);
            s.ellipse(
              s.noisify(f.x + d.x * j / items.length),
              s.noisify(f.y + d.y * j / items.length),
              x * 5)
          });
        }
      })),

      flees: (mouseBuffer) => mouseBuffer.map(([x, y]) => ({
        name: "flees",
        input: () => config.inputValues.beatPosition,
        fx: (color => v => {
          if ((v < 1 / 8) || Math.random() < 1 / 64) {
            if (x < 0 || y < 0 || x > s.width || y > s.height) {
              return
            }
            objects.push(new function () {
              this.point = {x: x + Math.random() - 1 / 2, y: y + Math.random() - 1 / 2};
              this.life = 15;
              this.lifespan = this.life;
              this.color = s.color(color);
              this.fx = () => {
                s.noStroke();
                s.fill(
                  this.color._getHue()+ (s.noise(Date.now() / 4096 * 87 / 89, this.point.x, this.point.y) - 1 / 2) * 20,
                  this.color._getSaturation(),
                  this.color._getBrightness(),
                  1 - (this.lifespan - this.life) / this.lifespan
                );
                s.ellipse(
                  this.point.x + (s.noise(s.frameCount / 60 * 73 / 71 + 100, this.point.x * 4, this.point.y * 4) - 1 / 2) * ((this.lifespan - this.life) / this.lifespan) * 600,
                  this.point.y + (s.noise(s.frameCount / 60, this.point.x * 4, this.point.y * 4) - 1 / 2) * ((this.lifespan - this.life) / this.lifespan) * 600,
                  10);
              }
            });
          }
        }
        )(config.setup.getCurrentColor())
      }))
    },
    symmetries:{
      none:  [],
      midPoint:  [([x,y]) =>[s.width-x,s.height-y]],
      midXLine:  [([x,y]) =>[x,s.height-y]],
      midYLine: [([x,y]) => [s.width-x,y]],
      midXYLines:[([x,y]) => [s.width-x,s.height-y],([x,y]) => [x,s.height-y],([x,y]) => [s.width-x,y]]
    },
    outputs: [],
  });


  config.graphical = config.graphical(s, livingObjects);

  let playerState, trackAnalysis;

  /*------------p5.js setup-----------------*/

  s.setup = () => {

    s.rectMode(s.CORNERS);
    s.colorMode(s.HSB);
    s.createCanvas(s.displayWidth, s.displayHeight);
    s.noFill();
    mic = new p5.AudioIn();
    mic.start();
    fft = new p5.FFT(spectrum.smoothing, spectrum.fourierPoints);
    fft.setInput(mic);
    s.stroke(255, 100, 0);

    let loadTrackStatus = function () {
      playerState = spotifyApi.getMyCurrentPlaybackState().then(state => {
        if(state===""||state.is_playing===false){
          console.error("no track playing");
          return;
        }
        state.realTimestamp = Date.now() - state.progress_ms;
        return state;
      }).catch(console.log);
    };

    document.getElementById('refreshSpotify').addEventListener('click', loadTrackStatus , false);

    loadTrackStatus();

    trackAnalysis = playerState.then(state => {
      if(state===undefined) {
        console.error("not logged in");
        return
      }
      if(!state) {
        console.error("no track playing");
        return
      }
      return spotifyApi.getAudioAnalysisForTrack(state.item.id);
      }
    ).then(analysis => analysis);

  };

  /*-------------Mouse drawing handling------------*/

  let mouseBuffer = [];
  let recording = false;

  s.mouseClicked = () => {
    if(s.mouseX<=s.width&&s.mouseX>=0&&s.mouseY<=s.height&&s.mouseY>=0){
      symmetricizedPoints(s,[[s.mouseX+Math.random()-1/2, s.mouseY+Math.random()-1/2]]).forEach(m =>
        config.graphical.outputs.push(...config.graphical.brushes[config.setup.getCurrentOutput()](m)));
    }
  };
  s.mousePressed = () => {
    recording = true;
  };
  s.mouseReleased = () => {
    recording = false;
    symmetricizedPoints(s,mouseBuffer).forEach(mouseBuffer =>
      config.graphical.outputs.push(...config.graphical.brushes[config.setup.getCurrentOutput()](mouseBuffer)));
    mouseBuffer = [];
  };
  s.mouseDragged = () => {
    if (recording) {
      if(s.mouseX<=s.width&&s.mouseX>=0&&s.mouseY<=s.height&&s.mouseY>=0) mouseBuffer.push([
        s.mouseX+Math.random()-1/2,
        s.mouseY+Math.random()-1/2]);
    }
    if(s.mouseX<=s.width&&s.mouseX>=0&&s.mouseY<=s.height&&s.mouseY>=0){
      return false;
    }
  };
  s.touchStarted= () => {
    recording = true;
    if (s.getAudioContext().state !== 'running') { //chrome hack na resuming audio context
      s.getAudioContext().resume();
    }
  };
  s.touchEnded = () => {
    recording = false;
    symmetricizedPoints(s,mouseBuffer).forEach(mouseBuffer =>
      config.graphical.outputs.push(...config.graphical.brushes[config.setup.getCurrentOutput()](mouseBuffer)));
    mouseBuffer = [];
  };
  s.touchMoved = () => {
    if (recording) {
      if(s.mouseX<=s.width&&s.mouseX>=0&&s.mouseY<=s.height&&s.mouseY>=0) mouseBuffer.push([
        s.mouseX+Math.random()-1/2,
        s.mouseY+Math.random()-1/2]);
    }
    if(s.mouseX<=s.width&&s.mouseX>=0&&s.mouseY<=s.height&&s.mouseY>=0){
      return false;
    }
  };
  let drawMouseBuffer = (s, mouseBuffer) => {
    s.stroke(127);
    s.noFill();
    s.strokeWeight(1);
    s.beginShape();
    mouseBuffer.forEach(([x, y]) => s.vertex(x, y));
    s.endShape();
  };

  let symmetricizedPoints = (s, points) => {
    let fxs = config.graphical.symmetries[config.setup.getCurrentSymmetry()];
    return [points,...fxs.map(fx => points.map(fx))];
  };
  /*---------------Draw cycle------------*/
  s.draw = () => {
    symmetricizedPoints(s,mouseBuffer).forEach(x => drawMouseBuffer(s,x));
    s.background(0, 0, 0, 60 / 255);
    s.noStroke();
    s.noFill();

    spectrum.datapoints = fft.analyze().slice(0, spectrum.pointsToShow);       //slice to show only 0 - 10025 Hz
    spectrum.difference = lastSpectrumData && spectrum.datapoints.map((x, i) => x - lastSpectrumData[i]);

    config.inputValues = Object.fromEntries(Object.entries(config.inputs).map(([k, {fx}]) => [k, fx(spectrum, positions)]));
    config.graphical.outputs.forEach(output => {
      output.fx(output.input());

    });


    livingObjects.forEach((x, i) => {
      x.fx();   //this does not have arguments because the position and effects are already ingrained in fx
      x.life--;
      if (x.life === 0) {
        livingObjects[i] = livingObjects[livingObjects.length - 1];
        livingObjects.pop();
      }
    });
    lastSpectrumData = spectrum.datapoints;

    /*---------------Spotify Processing------------*/
    playerState.then(function (playerState) {
      return trackAnalysis.then(function (trackAnalysis) {
        if(!trackAnalysis){
          return
        }
        let getPresentObject = (objects) => objects && objects.filter(function (duration) {
          return duration.start < (Date.now() - playerState.realTimestamp) / 1000 &&
            (Date.now() - playerState.realTimestamp) / 1000 < duration.start + duration.duration
        })[0];

        let actualBeat = getPresentObject(trackAnalysis.beats);
        let actualTatum = getPresentObject(trackAnalysis.tatums);
        let actualBar = getPresentObject(trackAnalysis.bars);
        let actualSegment = getPresentObject(trackAnalysis.segments);
        let actualSection = getPresentObject(trackAnalysis.sections);

        let extractPosition = (segment) => (((Date.now() - playerState.realTimestamp) / 1000 - segment.start) / segment.duration);

        positions.beatPosition = extractPosition(actualBeat);
        positions.tatumPosition = extractPosition(actualTatum);
        positions.barPosition = extractPosition(actualBar);
        positions.segmentPosition = extractPosition(actualSegment);
        positions.sectionPosition = extractPosition(actualSection);
      })
    })

  };
});

