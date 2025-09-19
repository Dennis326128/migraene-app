import React, { useEffect, useRef } from "react";
import Chart from "chart.js/auto";

const ChartComponent = ({ entries }) => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!entries || entries.length === 0) return;

    const ctx = chartRef.current.getContext("2d");

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    chartInstance.current = new Chart(ctx, {
      type: "line",
      data: {
        labels: entries.map((e) =>
          new Date(e.timestamp_created).toLocaleDateString()
        ),
        datasets: [
          {
            label: "Schmerzlevel",
            data: entries.map((e) => e.pain_level),
            borderColor: "red",
            backgroundColor: "rgba(255,0,0,0.3)",
            tension: 0.2,
            yAxisID: "y1",
          },
          {
            label: "Temperatur (°C)",
            data: entries.map((e) =>
              e.weather ? e.weather.temperature_c : null
            ),
            borderColor: "blue",
            backgroundColor: "rgba(0,0,255,0.3)",
            tension: 0.2,
            yAxisID: "y2",
          },
          {
            label: "Luftdruck (hPa)",
            data: entries.map((e) =>
              e.weather ? e.weather.pressure_mb : null
            ),
            borderColor: "green",
            backgroundColor: "rgba(0,255,0,0.3)",
            tension: 0.2,
            yAxisID: "y3",
          },
        ],
      },
      options: {
        responsive: true,
        interaction: {
          mode: "index",
          intersect: false,
        },
        stacked: false,
        plugins: {
          legend: {
            position: "top",
          },
          title: {
            display: true,
            text: "Schmerz- und Wetterverlauf",
          },
        },
        scales: {
          y1: {
            type: "linear",
            position: "left",
            title: {
              display: true,
              text: "Schmerzlevel",
            },
            min: 0,
            max: 10,
          },
          y2: {
            type: "linear",
            position: "right",
            title: {
              display: true,
              text: "Temperatur (°C)",
            },
            grid: {
              drawOnChartArea: false,
            },
          },
          y3: {
            type: "linear",
            position: "right",
            title: {
              display: true,
              text: "Luftdruck (hPa)",
            },
            grid: {
              drawOnChartArea: false,
            },
          },
        },
      },
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [entries]);

  return (
    <div className="bg-white p-4 rounded shadow">
      <canvas ref={chartRef} height="120"></canvas>
    </div>
  );
};

export default ChartComponent;