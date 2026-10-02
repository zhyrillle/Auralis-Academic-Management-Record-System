const fs = require('fs');
const file = 'd:/Auralis-Academic-Management-Record-System/frontend/src/components/adviser/AdviserTestExamAnalysis.jsx';
let content = fs.readFileSync(file, 'utf8');

const newRenderChart = 
  const series = [
    {
      name: "Got 75% Above",
      color: "#183256", // Dark navy from theme
      values: [
        { value: currentData.above75?.[0]?.percent ?? 0, label: "ST1" },
        { value: currentData.above75?.[1]?.percent ?? 0, label: "ST2" },
        { value: currentData.above75?.[2]?.percent ?? 0, label: "TE" },
      ]
    },
    {
      name: "Got 75% Below",
      color: "#D8A62A", // Gold from theme
      values: [
        { value: currentData.below75?.[0]?.percent ?? 0, label: "ST1" },
        { value: currentData.below75?.[1]?.percent ?? 0, label: "ST2" },
        { value: currentData.below75?.[2]?.percent ?? 0, label: "TE" },
      ]
    }
  ];

  const renderChart = () => {
    return (
      <div className="adviser-dashboard__test-chart-item" style={{ flex: 1, minWidth: 0 }}>
        {loading ? (
          <div className="adviser-dashboard__skeleton-chart" style={{ height: "190px" }} />
        ) : (
          <LineChart
            ariaLabel="Test Exam Result Trend"
            labels={["ST1", "ST2", "TE"]}
            series={series}
            minimum={0}
            maximum={100}
            ticks={[0, 20, 40, 60, 80, 100]}
            benchmark={-1}
            showArea={true}
          />
        )}
      </div>
    );
  };
;

const startIndex = content.indexOf('  const renderPolarSlice');
const endIndex = content.lastIndexOf('  return ('); // Last index to get the main return

content = content.substring(0, startIndex) + newRenderChart + content.substring(endIndex);

content = content.replace(/\{renderChart\(currentData\.above75 \|\| \[\], "Got 75% Above"\)\}\s*\{renderChart\(currentData\.below75 \|\| \[\], "Got 75% Below"\)\}/, '{renderChart()}');

fs.writeFileSync(file, content);
console.log('Done!');
