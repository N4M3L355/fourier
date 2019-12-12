function drawTonalHistory() {
  spectrum.tonalSums.forEach((x, i) => {
    s.stroke(myScaleHues[i % 12], 100, 100);
    s.point(window.innerWidth - 32 - (12 - i) * 32, window.innerHeight - 128 - (x) * 256);
  });
}

function drawTonalSpectrum(horizontalScaling) {
  s.strokeWeight(1);
  let exaggeratedTonalSums = spectrum.tonalSums.map(x => x ** 6);
  let entireSum = sum(...exaggeratedTonalSums);
  let actualSum = 0, part;
  let sortedTonalSums = exaggeratedTonalSums.map((x, i) => [i, x]);//.sort((a,b) => a[1]-b[1]);
  sortedTonalSums.forEach((tonalSum) => {
    part = tonalSum[1] / entireSum;
    spectrum.history.processedTonalSums[tonalSum[0]].append([s.map(actualSum, 0, 1, height, height / 2), s.map(actualSum + part, 0, 1, height, height / 2)]);
    actualSum += part;
  });
  spectrum.history.processedTonalSums.forEach((history, tone) => {
    s.stroke(myScaleHues[tone], 100, 100);
    history.get().forEach((x, i) => {
      s.line(horizontalScaling * i, x[0], horizontalScaling * i, x[1]);
    })
  });
}
//--------------------

spectrum.dataTuples = spectrum.datapoints.slice(0, spectrum.pointsToAnalyze).map((x, i) => [i, x]);  //slice to analyze only 0 - 5012.5 Hz, first is index, second amplitude


let SpectrumTuplesSortedByAmp = spectrum.dataTuples.sort((a, b) => a[1] - b[1]);


tonalAmps.map((x, i, a) => {
  let sortedE = [a[i - 6], a[i - 1], a[i + 1], a[i + 6]].filter(x => x).map(x => x[1]);
  tonalSums[i % 12] += ((x[1] - Math.max(...sortedE)));	//*((i-i%12)/12+1);
  return (x[1] / mean(...sortedE)) || 0;
});
spectrum.history.tonalSums.append(tonalSums);
tonalSums = ((avg, min) => tonalSums.map((x) => Math.min(s.map(x, min, avg, 0, 0.5), 1)))(mean(...tonalSums), Math.min(...tonalSums));    //normalization
drawTonalSums(tonalSums);


//-----------------------

s.stroke(50, 100, 100);
spectrum.history.hihatAvgs.append(config.inputValues.hiHat);
drawHistory(spectrum.history.hihatAvgs.get());

s.stroke(0, 100, 100);
spectrum.history.kickAvgs.append(config.inputValues.kick);
drawHistory(spectrum.history.kickAvgs.get());

let volumeAmpsAvg = mean(...SpectrumTuplesSortedByAmp.slice(-64).map(x => x[1]));
spectrum.history.entireVolumes.append(volumeAmpsAvg);
s.stroke(0, 0, 50);
drawHistory(spectrum.history.entireVolumes.get());

//drawTonalSpectrum(8);

//------------------------------------------

let tonalSums = Array(12).fill(0);


((tonalSums) =>
    out(tonalSums.map((x, i, a) =>
      getChord(a.slice(0, i))
    ).join("<br>"))
)(tonalSums.map((x, i) => [i, x]).sort((a, b) => b[1] - a[1]));

//----------------------------------------

//----------------------------------------


function drawTonalSums(tonalSums) {
  s.strokeWeight(15);
  tonalSums.forEach((x, i) => {
    s.stroke(myScaleHues[i % 12], 100, 100);
    s.point(window.innerWidth - 32 - (12 - i) * 32, window.innerHeight - 128 - (x) * 256);
  });

  s.strokeWeight(1);
  myScale.forEach((x, i) => {
    s.stroke(myScaleHues[i % 12], 100, 100);
    s.text(x, window.innerWidth - 32 - (12 - i) * 32, window.innerHeight - 104);
  });
}


function drawHistory(history) {
  s.strokeWeight(1);
  s.beginShape();
  history.forEach((x, i, a) => {
    s.vertex(i, s.map(x, 0, 255, window.innerHeight, window.innerHeight / 2));
    if (x !== 0 && x === Math.max(...a.slice(i - 12, i + 12))) {
      s.strokeWeight(5);
      s.point(i, s.map(x, 0, 255, window.innerHeight, window.innerHeight / 2));
      s.strokeWeight(1);
    }
  });
  s.endShape();
}


//--------------inputs from config-----------------//
x = ({
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
      let containers = Array(12).fill(0);
      spectrum.tonalFrequencies.forEach((x,i) => {
        let freqs = [spectrum.getInterpolatedAmp(x / (spectrum.step ** (1 / 2))),
          spectrum.getInterpolatedAmp(x * (spectrum.step ** (1 / 2))),
          spectrum.getInterpolatedAmp(x / (spectrum.step ** (1))),
          spectrum.getInterpolatedAmp(x * (spectrum.step ** (1)))];
        let firstTwo = mean(...freqs.sort((a, b) => b - a).slice(0, 2));
        containers[i%12] += Math.max(0, spectrum.getInterpolatedAmp(x) - firstTwo)*(4096/x);
      });
      return containers;
      containers = containers.map((x,i) => ({note: myScale[i], amp: x}))  //TODO: this is not efective
        .sort((a, b) => b.amp - a.amp);
      console.log(containers);


    }
  },
  beat: {name: "beat", fx: (spectrum, positions) => positions.beatPosition},
  tatum: {name: "tatum", fx: (spectrum, positions) => positions.tatumPosition},
  bar: {name: "bar", fx: (spectrum, positions) => positions.barPosition}
}
})


/*config.graphical.outputs.push({   //midScreenSpectrum, todo: toto musí ísť doriti
  input: (spectrum, positions) => {
    return spectrum.tonalFrequencies.map((x) => {
      let freqs = [spectrum.getInterpolatedAmp(x / (spectrum.step ** (1 / 2))),
        spectrum.getInterpolatedAmp(x * (spectrum.step ** (1 / 2))),
        spectrum.getInterpolatedAmp(x / (spectrum.step ** (1))),
        spectrum.getInterpolatedAmp(x * (spectrum.step ** (1)))];
      let firstTwo = mean(...freqs.sort((a, b) => b - a).slice(0, 2));
      return Math.max(0, spectrum.getInterpolatedAmp(x) - firstTwo)*(4096/x);
    });
  }
  ,
  fx:notes => {
    objects.push(new function () {
      this.point = {x:100,y:800};
      this.life = 1;
      this.fx = () =>{
        s.noFill();
        s.strokeWeight(10);
        notes.forEach((note, i)  => {
          s.stroke(myScaleHues[i % 12], 100, 100);
          s.line(this.point.x+i*40,this.point.y-s.noise(i/15,s.frameCount/63)*200,this.point.x+i*40,this.point.y-note*10-s.noise(i/16,s.frameCount/64)*200);

          let whereFrom = polarToCartesianMidScreen(200,i*Math.PI/6/6); //7*1.0014
          let whereTo = polarToCartesianMidScreen(200+note*10,i*Math.PI/6/6); //7*1.0014
          //s.line(whereFrom.x,whereFrom.y,whereTo.x,whereTo.y);
          //s.ellipse(where.x,where.y, 1+note*3);

        });
      }
    })
  }
});

config.graphical.outputs.push({   //midScreenSpectrum, todo: toto musí ísť doriti
  input: (spectrum, positions) => positions.beatPosition,
  fx:v => {
    objects.push(new function () {
      this.point = {x:100,y:800};
      this.life = 1;
      this.fx = () =>{
        s.stroke(255);
        s.noFill();
        s.strokeWeight(1);
        s.beginShape();
        for(i=0;i<94;i++){
          if(Math.abs(v*94-i)<1){
            increment=-20;
          }else if(Math.abs(v*94-i)<3){
            increment=20;
          }
          else{
            increment=0;
          }
          s.curveVertex(i*20,increment+s.height/2+s.noise(i/32)*800-400+s.noise(i,s.frameCount/16)*20);
        }
        s.endShape();
      }
    })
  }
})*/