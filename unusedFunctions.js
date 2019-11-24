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
function getChord(amps) {
  let intervals = amps
    .map(x => x[0])
    .map((x, i, a) =>
      a.slice(i)
        .concat(a.slice(0, i))
    );
  return intervals
    .map((x) => [myScale[x[0]], (chordFromNotes[
      x.map(y => (y - x[0] + 12) % 12)
        .sort((a, b) => a - b)
        .join()])])
    .filter(x => x[1])
    .map(x => `${x[0]}${x[1]}`);
}

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