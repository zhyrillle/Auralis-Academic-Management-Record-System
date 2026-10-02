const fs = require('fs');
const file = 'd:/Auralis-Academic-Management-Record-System/frontend/src/components/adviser/AdviserSubjectAreaHBarChart.jsx';
let content = fs.readFileSync(file, 'utf8');

// Change xTicks
content = content.replace('const xTicks = [0, 50, 100, 150, 200];', 'const xTicks = [0, 20, 40, 60, 80, 100];');

// Fix bar scaling
content = content.replace('const barVal = item.grade ? Math.min(200, Math.round(scoreVal * 2)) : Math.min(200, scoreVal);', 'const barVal = Math.min(100, scoreVal);');
content = content.replace('const barWidth = (barVal / 200) * plotWidth;', 'const barWidth = (barVal / 100) * plotWidth;');

// Fix xTicks scaling
content = content.replace('const x = leftLabelPad + (tick / 200) * plotWidth;', 'const x = leftLabelPad + (tick / 100) * plotWidth;');

fs.writeFileSync(file, content);
console.log('Fixed xTicks and bar scaling!');
