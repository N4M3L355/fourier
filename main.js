
let config = {
  graphical: (s, objects) => ({
    inputs: {
      kick: {name: "kick", fx: (spectrum, positions) => spectrum.averageFrequencies(1, 80)},
      hiHat: {name: "hiHat", fx: (spectrum, positions) => spectrum.averageFrequencies(4000, 8000)},
      notes: {
        name: "notes", fx: (spectrum, positions) => {
          return spectrum.tonalFrequencies.map((x) => {
            let freqs = [spectrum.getInterpolatedAmp(x / (spectrum.step ** (1 / 2))),
              spectrum.getInterpolatedAmp(x * (spectrum.step ** (1 / 2))),
              spectrum.getInterpolatedAmp(x / (spectrum.step ** (1))),
              spectrum.getInterpolatedAmp(x * (spectrum.step ** (1)))];
            let firstTwo = mean(...freqs.sort((a, b) => b - a).slice(0, 2));
            return Math.max(0, spectrum.getInterpolatedAmp(x) - firstTwo)*(4096/x);
          });
        }
      },
      tones: {
        name: "tones", fx: (spectrum, positions) => {
        }
      },
      beat: {name: "beat", fx: (spectrum, positions) => positions.beatPosition},
      tatum: {name: "tatum", fx: (spectrum, positions) => positions.tatumPosition},
      bar: {name: "bar", fx: (spectrum, positions) => positions.barPosition}
    },
    brushes: {
      pulse: (x, y) => ({
        name: "pulse",
        input: "tatum",
        fx: v => {
          s.stroke(30, 100, 100);
          out(v);
          s.ellipse(x, y, (1 - Math.abs(1 - 2 * v)) ** 2 * 100)
        }
      }),
      flees: (x, y) => ({
        name: "flees",
        input: "beat",
        fx: v => {
          if ((v < 1 / 8) || Math.random() < 1 / 64) {
            objects.push(new function () {
              this.point = {x: x + Math.random() - 1 / 2, y: y + Math.random() - 1 / 2};
              this.life = 30;
              this.color = [150 + Math.random() * 300, 100, 100];
              this.fx = () => {
                s.noStroke();
                s.fill(
                  this.color[0] + (s.noise(Date.now() / 4096 * 87 / 89, this.point.x, this.point.y) - 1 / 2) * 60,
                  this.color[1],
                  this.color[2] * (1 - (30 - this.life) / 30)
                );
                s.ellipse(
                  this.point.x + (s.noise(Date.now() / 4096 * 71 / 73, this.point.x * 4, this.point.y * 4) - 1 / 2) * ((30 - this.life) / 30) * 300,
                  this.point.y + (s.noise(Date.now() / 4096, this.point.x * 4, this.point.y * 4) - 1 / 2) * ((30 - this.life) / 30) * 300,
                  5);
              }
            });
          }
        }
      }) //pulse, ray, spectrum
    },
    outputs: []
  })
};

let out = (where => (...what) => {
  where.innerHTML = what;
  return what;
})(document.getElementById("out"));

let sum = (...a) => a.reduce((a, b) => a + b);
let mean = (...a) => sum(...a) / a.length;
let product = (...a) => a.reduce((a, b) => a * b);
let geoMean = (...a) => Math.abs(product(...a)) ** (1 / a.length);

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


P5 = p5;

new P5((s) => {

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
    this.history = {
      kickAvgs: new SlidingArray(this.framesToAnalyze), //kick averages
      hihatAvgs: new SlidingArray(this.framesToAnalyze), //hihat averages
      entireVolumes: new SlidingArray(this.framesToAnalyze),
      tonalAmps: new SlidingArray(this.framesToAnalyze, [0]),
      tonalSums: new SlidingArray(this.framesToAnalyze, [0]),
      processedTonalSums: Array(12).fill(0).map(() => new SlidingArray(this.framesToAnalyze, [0, 0])),	//this is array itself!
    };
    this.tonalFrequencies = Array(12 * this.octaves).fill(0).map((x, i) => this.base * (this.step ** (i)));
    this.getNearestPoints = (where, n) => getNearestIndexes(this.datapoints.map((x, i) => [i, x]), where, n);
    this.getInterpolatedAmp = (hz) => {
      return lagrangeQuadraticInterpolation(this.getNearestPoints(this.hzToIndex(hz), 3), this.hzToIndex(hz))
    };
    this.averageFrequencies = (fromHZ, toHZ) => {
      let avgs = mean(...this.datapoints.slice(this.hzToIndex(fromHZ), this.hzToIndex(toHZ)));

      DEBUG && s.line(Math.log2(this.hzToIndex(fromHZ)) * horizontalScaling,
        s.map(avgs, 0, 255, window.innerHeight / 2, 0),
        Math.log2(this.hzToIndex(toHZ)) * horizontalScaling,
        s.map(avgs, 0, 255, window.innerHeight / 2, 0)
      );

      return avgs;
    };
    this.getTonalAmps = () => this.tonalFrequencies.map((x) => [x, this.getInterpolatedAmp(x)]);
  }

//TODO: masking, fft na rytmus, derivácia nôt, time eventing, spotify

  let mic;
  let fft;
  let lastSpectrumData;
  let spectrum = new Spectrum(27 / 32, 1024, 512, 512);
  let myScale = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"];
  let myScaleHues = [45, 300, 105, 0, 195, 30, 270, 60, 330, 150, 15, 240];

  let horizontalScaling = 128 + 64 - 4;

  let positions = {
    beatPosition: 0,
    tatumPosition: 0,
    barPosition: 0,
    segmentPosition: 0,
    sectionPosition: 0
  };
  let objects = [];
  config = config.graphical(s, objects);

  let playerState, trackAnalysis;
  s.setup = () => {

    s.rectMode(s.CORNERS);
    s.colorMode(s.HSB);
    s.createCanvas(window.innerWidth, window.innerHeight * 2);
    s.noFill();
    mic = new p5.AudioIn();
    mic.start();
    fft = new p5.FFT(spectrum.smoothing, spectrum.fourierPoints);
    fft.setInput(mic);
    s.stroke(255, 100, 0);


    let access_token;

    (function () {
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
          let redirect_uri = 'http://localhost:63342/fourier/main.html'; // Your redirect uri
          let state = generateRandomString(16);
          localStorage.setItem(stateKey, state);
          let scope = 'user-read-private user-read-email';
          let url = 'https://accounts.spotify.com/authorize';
          url += '?response_type=token';
          url += '&client_id=' + encodeURIComponent(client_id);
          url += '&scope=' + encodeURIComponent(scope);
          url += '&redirect_uri=' + encodeURIComponent(redirect_uri);
          url += '&state=' + encodeURIComponent(state);
          window.location = url;
        }, false);
      }
    })();

    const spotifyApi = new SpotifyWebApi();
    spotifyApi.setAccessToken(access_token);
    playerState = spotifyApi.getMyCurrentPlaybackState().then(state => {
      console.log(state);
      state.realTimestamp = Date.now() - state.progress_ms;
      return state;
    });
    trackAnalysis = playerState.then(state => spotifyApi.getAudioAnalysisForTrack(state.item.id).then(function (analysis) {
        console.log(analysis);
        return analysis;
      })
    );

    let polarToCartesian = (middleX,middleY) => (radius,angle) => ({x:Math.sin(angle)*radius+middleX,y:Math.cos(angle)*radius+middleY});
    let polarToCartesianMidScreen = polarToCartesian(window.innerWidth/2,window.innerHeight/2);
    config.outputs.push({
      input: "notes",
      fx:notes => {
        objects.push(new function () {
          this.point = {x:100,y:800};
          this.life = 1;
          this.fx = () =>{
            s.noFill();
            s.strokeWeight(5);
            notes.forEach((note, i)  => {
              s.stroke(myScaleHues[i % 12], 100, 100);
              s.line(this.point.x+i*23,this.point.y,this.point.x+i*23,this.point.y-note);

              let whereFrom = polarToCartesianMidScreen(100,i*Math.PI/6/6); //7*1.0014
              let whereTo = polarToCartesianMidScreen(100+note*3,i*Math.PI/6/6); //7*1.0014
              s.line(whereFrom.x,whereFrom.y,whereTo.x,whereTo.y);
              //s.ellipse(where.x,where.y, 1+note*3);

            });
          }
        })
      }
    });
  };


  function drawSpectrum(points) {
    s.strokeWeight(1);
    if (!points) return;
    s.beginShape();
    for (let i = 0; i < points.length; i++) {    //draw spectrum
      s.vertex(horizontalScaling * Math.log2(i), s.map(points[i], 0, 255, window.innerHeight / 2, 0));
    }
    s.endShape();
  }

  function drawOctaveBands() {
    s.strokeWeight(1);
    for (let i = 0; i < spectrum.octaves + 1; i++) {        //octave bands, tone A
      s.line(Math.log2(spectrum.hzToIndex(spectrum.base * 2 ** i)) * horizontalScaling, 0, Math.log2(spectrum.hzToIndex(spectrum.base * 2 ** i)) * horizontalScaling, window.innerHeight / 2);
    }
  }

  function drawTonalAmplitudes(tonalAmps) {
    s.strokeWeight(15);
    tonalAmps.forEach((x, i) => {     //draw interpolated tone amplitudes
      s.stroke(myScaleHues[i % 12], 100, x[1]);
      s.point(Math.log2(spectrum.hzToIndex(x[0])) * horizontalScaling, s.map(x[1], 0, 255, window.innerHeight / 2, 0));
    });
  }


  s.draw = () => {
    s.fill(0, 0, 0, 60/255);
    s.rect(0, 0, window.innerWidth, window.innerHeight);
    s.noFill();
    spectrum.datapoints = fft.analyze().slice(0, spectrum.pointsToShow);       //slice to show only 0 - 10025 Hz
    spectrum.difference = lastSpectrumData && spectrum.datapoints.map((x, i) => x - lastSpectrumData[i]);


    s.stroke(0, 0, 100);

    drawSpectrum(spectrum.datapoints);
    drawSpectrum(spectrum.difference);
    s.stroke(300, 100, 100);
    s.strokeWeight(1);

    drawOctaveBands();
    let tonalAmps = spectrum.getTonalAmps();      //interpolated tone amplitudes
    spectrum.history.tonalAmps.append(tonalAmps);
    drawTonalAmplitudes(tonalAmps);


    s.strokeWeight(1);


    config.inputValues = Object.fromEntries(Object.entries(config.inputs).map(([k, {fx}]) => [k, fx(spectrum, positions)]));

    config.outputs.forEach(output => {
      output.fx(config.inputValues[output.input]);

    });


    objects.forEach((x,i) => {
      x.fx();
      x.life--;
      if(x.life===0) {
        objects[i] = objects[objects.length-1];
        objects.pop();
      }});

    if (s.mouseIsPressed) {
      config.outputs.push(config.brushes["flees"](s.mouseX, s.mouseY));
    }
    s.stroke(255);
    lastSpectrumData = spectrum.datapoints;
    playerState.then(function (playerState) {
      s.line(
        s.windowWidth * ((Date.now() - playerState.realTimestamp) / playerState.item.duration_ms * 0.8 + 0.2),
        0,
        s.windowWidth * ((Date.now() - playerState.realTimestamp) / playerState.item.duration_ms * 0.8 + 0.2),
        s.windowHeight / 2
      );
      trackAnalysis.then(function (trackAnalysis) {
        trackAnalysis.sections.forEach(function (section, index) {
          s.line(
            s.windowWidth * ((section.start) / trackAnalysis.track.duration * 0.8 + 0.2),
            0,
            s.windowWidth * ((section.start) / trackAnalysis.track.duration * 0.8 + 0.2),
            s.windowHeight / 2
          )
        });

        let getPresentObject = (objects) => objects.filter(function (beat) {
          return beat.start < (Date.now() - playerState.realTimestamp) / 1000 &&
            (Date.now() - playerState.realTimestamp) / 1000 < beat.start + beat.duration
        })[0];

        let actualBeat = getPresentObject(trackAnalysis.beats);
        let actualTatum = getPresentObject(trackAnalysis.tatums);
        let actualBar = getPresentObject(trackAnalysis.bars);
        let actualSegment = getPresentObject(trackAnalysis.segments);
        let actualSection = getPresentObject(trackAnalysis.sections);

        positions.beatPosition = (((Date.now() - playerState.realTimestamp) / 1000 - actualBeat.start) / actualBeat.duration);
        positions.tatumPosition = (((Date.now() - playerState.realTimestamp) / 1000 - actualTatum.start) / actualTatum.duration);
        positions.barPosition = (((Date.now() - playerState.realTimestamp) / 1000 - actualBar.start) / actualBar.duration);
        positions.segmentPosition = (((Date.now() - playerState.realTimestamp) / 1000 - actualSegment.start) / actualSegment.duration);
        positions.sectionPosition = (((Date.now() - playerState.realTimestamp) / 1000 - actualSection.start) / actualSection.duration);

        s.ellipse(50, 100 + (1-Math.abs(1-2*positions.segmentPosition))**2 * 100, 50);
        s.ellipse(250, 100 + (1-Math.abs(1-2*positions.beatPosition))**2 * 100, 50);
        s.ellipse(150, 100 + (1-Math.abs(1-2*positions.tatumPosition))**2 * 100, 50);
        s.ellipse(350, 100 + (1-Math.abs(1-2*positions.barPosition))**2 * 100, 50);


        s.line(s.windowWidth * 0.6, s.windowHeight * 0.5, s.windowWidth * 0.6, s.windowHeight)

      })

    })

  }


});

