// HealthPage.tsx
import { useTranslation } from 'react-i18next';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import axios from 'axios';
import * as d3 from 'd3';
import { Container, Row, Col, Button, Form } from 'react-bootstrap';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import Header from '../components/common/Header';
import authStore from '../stores/authStore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveAs } from 'file-saver';
import { useNavigate } from 'react-router-dom';
import Accordion from 'react-bootstrap/Accordion';


interface HeartRateZone {
  name: string;
  minutes: number;
}
interface FitbitEntry {
  date: string;
  steps?: number;
  resting_heart_rate?: number;
  heart_rate_zones: HeartRateZone[];
}

interface QuestionnaireEntry {
  date: string;
  questionKey: string;
  answers: { key: string }[];
  questionTranslations: { language: string; text: string }[];
}

const HealthPage: React.FC = () => {
  const svgRefBreathing = useRef<SVGSVGElement>(null);
  const svgRefTotalScore = useRef<SVGSVGElement>(null);
  const { i18n } = useTranslation();
const [viewMode, setViewMode] = useState<'weekly' | 'monthly'>('monthly');
const [referenceDate, setReferenceDate] = useState<Date>(new Date());

  const svgRefDistance = useRef<SVGSVGElement>(null);
  const svgRefSleep = useRef<SVGSVGElement>(null);
  const svgRefHRZones = useRef<SVGSVGElement>(null);
  const svgRefFloors = useRef<SVGSVGElement>(null);
  const svgRefSteps = useRef<SVGSVGElement>(null);
  const svgRefHRV = useRef<SVGSVGElement>(null);
  const [fitbitData, setFitbitData] = useState<FitbitEntry[]>([]);
  const [questionnaireData, setQuestionnaireData] = useState<QuestionnaireEntry[]>([]);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [error, setError] = useState<string>('');
  const [visibleFitbit, setVisibleFitbit] = useState({ steps: true, resting_heart_rate: true });
  const [visibleQuestions, setVisibleQuestions] = useState<Record<string, boolean>>({});
  const svgRefFitbit = useRef<SVGSVGElement>(null);
  const svgRefQuestionnaire = useRef<SVGSVGElement>(null);
  const fetchedRange = useRef<{ from: Date; to: Date } | null>(null);
const [exportSelections, setExportSelections] = useState<Record<string, boolean>>({
  totalScore: true,
  questionnaire: true,
  restingHR: true,
  sleep: true,
  hrZones: true,
  floors: true,
  steps: true,
  distance: true,
  breathing: true,
  hrv: true,
});

  const navigate = useNavigate();
const calculateDateRange = () => {
  let start: Date, end: Date;
  if (viewMode === 'weekly') {
    const day = referenceDate.getDay();
    const diffToMonday = referenceDate.getDate() - day + (day === 0 ? -6 : 1);
    start = new Date(referenceDate);
    start.setDate(diffToMonday);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
  } else {
    start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
  }
  return [start, end];
};

const goToPrevious = () => {
  setReferenceDate((prev) => {
    const newDate = new Date(prev);
    if (viewMode === 'weekly') newDate.setDate(newDate.getDate() - 7);
    else newDate.setMonth(newDate.getMonth() - 1);
    return newDate;
  });
};

const goToNext = () => {
  setReferenceDate((prev) => {
    const newDate = new Date(prev);
    if (viewMode === 'weekly') newDate.setDate(newDate.getDate() + 7);
    else newDate.setMonth(newDate.getMonth() + 1);
    return newDate;
  });
};

const fetchData = async (from?: Date, to?: Date) => {
  try {
    const userId = localStorage.getItem('selectedPatient');
    const params: any = {};
    if (from && to) {
      params.from = from.toISOString().slice(0, 10);
      params.to = to.toISOString().slice(0, 10);
    }
    const res = await axios.get(`/api/patients/health-combined-history/${userId}/`, { params });
    const { fitbit, questionnaire } = res.data;

    setFitbitData(fitbit || []);
    setQuestionnaireData(questionnaire || []);

    // Track fetched range
    fetchedRange.current = { from: new Date(params.from), to: new Date(params.to) };

    // Initialize visible questions
    const visibility: Record<string, boolean> = {};
    for (const q of questionnaire) {
      if (!(q.questionKey in visibility)) {
        visibility[q.questionKey] = true;
      }
    }
    setVisibleQuestions(visibility);
  } catch (err) {
    console.error(err);
    setError('Failed to load health data.');
  }
};


  const drawHRVChart = () => {
    if (!svgRefHRV.current || !document.body.contains(svgRefHRV.current)) return;

    const svg = d3.select(svgRefHRV.current);
    d3.select(svgRefHRV.current).selectChildren().remove();  // ✅ safer


    const margin = { top: 40, right: 30, bottom: 50, left: 50 };
    const width = 900 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    const parseDate = d3.timeParse('%Y-%m-%d');
    const filtered = fitbitData.filter((d) => {
      const dDate = new Date(d.date);
      return (
        (!startDate || dDate >= startDate) &&
        (!endDate || dDate <= endDate) &&
        d.hrv?.dailyRmssd !== undefined
      );
    });

    const x = d3
      .scaleTime()
      .domain(d3.extent(filtered, (d) => parseDate(d.date)!) as [Date, Date])
      .range([0, width]);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(filtered, (d) => d.hrv?.dailyRmssd || 0) || 80])
      .nice()
      .range([height, 0]);

    const chart = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    chart
      .append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.timeFormat('%b %d') as any));

    chart.append('g').call(d3.axisLeft(y));

    const line = d3
      .line<FitbitEntry>()
      .defined((d) => d.hrv?.dailyRmssd !== undefined)
      .x((d) => x(parseDate(d.date)!))
      .y((d) => y(d.hrv!.dailyRmssd));

    const tooltip = d3
      .select('body')
      .append('div')
      .attr('class', 'tooltip bg-light border p-2 position-absolute')
      .style('opacity', 0)
      .style('pointer-events', 'none');

    chart
      .append('path')
      .datum(filtered.filter(line.defined()))
      .attr('fill', 'none')
      .attr('stroke', '#9467bd')
      .attr('stroke-width', 2)
      .attr('d', line);

    chart
      .selectAll('circle')
      .data(filtered.filter(line.defined()))
      .enter()
      .append('circle')
      .attr('cx', (d) => x(parseDate(d.date)!))
      .attr('cy', (d) => y(d.hrv!.dailyRmssd))
      .attr('r', 4)
      .attr('fill', '#9467bd')
      .on('mouseover', function (event, d) {
        tooltip
          .html(`<strong>${d.date}</strong><br/>Value: ${d.hrv!.dailyRmssd}`)
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 20}px`)
          .style('opacity', 1);
      })
      .on('mousemove', function (event) {
        tooltip.style('left', `${event.pageX + 10}px`).style('top', `${event.pageY - 20}px`);
      })
      .on('mouseout', () => tooltip.style('opacity', 0));

    svg
      .append('text')
      .attr('x', width / 2 + margin.left)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .style('font-size', '16px')
      .text('Heart Rate Variability (dailyRmssd in ms)');
  };
  const drawBreathingRateChart = () => {
    if (!svgRefBreathing.current || !document.body.contains(svgRefBreathing.current)) return;

    const svg = d3.select(svgRefBreathing.current);
    d3.select(svgRefBreathing.current).selectChildren().remove();  // ✅ safer


    const margin = { top: 40, right: 30, bottom: 50, left: 50 };
    const width = 900 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    const parseDate = d3.timeParse('%Y-%m-%d');
    const filtered = fitbitData.filter((d) => {
      const dDate = new Date(d.date);
      return (!startDate || dDate >= startDate) && (!endDate || dDate <= endDate);
    });

    const x = d3
      .scaleTime()
      .domain(d3.extent(filtered, (d) => parseDate(d.date)!) as [Date, Date])
      .range([0, width]);

    const y = d3
      .scaleLinear()
      .domain([10, d3.max(filtered, (d) => d.breathing_rate?.breathingRate || 0) || 20])
      .nice()
      .range([height, 0]);

    const chart = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    chart
      .append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.timeFormat('%b %d') as any));

    chart.append('g').call(d3.axisLeft(y));

    const line = d3
      .line<FitbitEntry>()
      .defined((d) => d.breathing_rate?.breathingRate !== undefined)
      .x((d) => x(parseDate(d.date)!))
      .y((d) => y(d.breathing_rate!.breathingRate));

    const tooltip = d3
      .select('body')
      .append('div')
      .attr('class', 'tooltip bg-light border p-2 position-absolute')
      .style('opacity', 0)
      .style('pointer-events', 'none');

    chart
      .append('path')
      .datum(filtered.filter(line.defined()))
      .attr('fill', 'none')
      .attr('stroke', '#2ca02c')
      .attr('stroke-width', 2)
      .attr('d', line);

    chart
      .selectAll('circle')
      .data(filtered.filter(line.defined()))
      .enter()
      .append('circle')
      .attr('cx', (d) => x(parseDate(d.date)!))
      .attr('cy', (d) => y(d.breathing_rate!.breathingRate))
      .attr('r', 4)
      .attr('fill', '#2ca02c')
      .on('mouseover', function (event, d) {
        tooltip
          .html(`<strong>${d.date}</strong><br/>Value: ${d.breathing_rate?.breathingRate}`)
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 20}px`)
          .style('opacity', 1);
      })
      .on('mousemove', function (event) {
        tooltip.style('left', `${event.pageX + 10}px`).style('top', `${event.pageY - 20}px`);
      })
      .on('mouseout', () => tooltip.style('opacity', 0));

    svg
      .append('text')
      .attr('x', width / 2 + margin.left)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .style('font-size', '16px')
      .text('Breathing Rate (breaths/min)');
  };
  const drawDistanceChart = () => {
    if (!svgRefDistance.current || !document.body.contains(svgRefDistance.current)) return;

    const svg = d3.select(svgRefDistance.current);
    d3.select(svgRefDistance.current).selectChildren().remove();  // ✅ safer


    const margin = { top: 40, right: 30, bottom: 50, left: 50 };
    const width = 900 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    const parseDate = d3.timeParse('%Y-%m-%d');
    const filtered = fitbitData.filter((d) => {
      const dDate = new Date(d.date);
      return (!startDate || dDate >= startDate) && (!endDate || dDate <= endDate);
    });

    const x = d3
      .scaleTime()
      .domain(d3.extent(filtered, (d) => parseDate(d.date)!) as [Date, Date])
      .range([0, width]);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(filtered, (d) => d.distance || 0) || 10])
      .nice()
      .range([height, 0]);

    const chart = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    chart
      .append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.timeFormat('%b %d') as any));

    chart.append('g').call(d3.axisLeft(y));

    const line = d3
      .line<FitbitEntry>()
      .defined((d) => d.distance !== undefined)
      .x((d) => x(parseDate(d.date)!))
      .y((d) => y(d.distance!));

    const tooltip = d3
      .select('body')
      .append('div')
      .attr('class', 'tooltip bg-light border p-2 position-absolute')
      .style('opacity', 0)
      .style('pointer-events', 'none');

    chart
      .append('path')
      .datum(filtered.filter(line.defined()))
      .attr('fill', 'none')
      .attr('stroke', '#9467bd')
      .attr('stroke-width', 2)
      .attr('d', line);

    chart
      .selectAll('circle')
      .data(filtered.filter(line.defined()))
      .enter()
      .append('circle')
      .attr('cx', (d) => x(parseDate(d.date)!))
      .attr('cy', (d) => y(d.distance!))
      .attr('r', 4)
      .attr('fill', '#9467bd')
      .on('mouseover', function (event, d) {
        tooltip
          .html(`<strong>${d.date}</strong><br/>Value: ${d.distance!}`)
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 20}px`)
          .style('opacity', 1);
      })
      .on('mousemove', function (event) {
        tooltip.style('left', `${event.pageX + 10}px`).style('top', `${event.pageY - 20}px`);
      })
      .on('mouseout', () => tooltip.style('opacity', 0));

    svg
      .append('text')
      .attr('x', width / 2 + margin.left)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .style('font-size', '16px')
      .text('Distance Traveled');
  };
  const drawFloorsChart = () => {
    if (!svgRefFloors.current || !document.body.contains(svgRefFloors.current)) return;

    const svg = d3.select(svgRefFloors.current);
    d3.select(svgRefFloors.current).selectChildren().remove();  // ✅ safer

    const margin = { top: 40, right: 30, bottom: 50, left: 50 };
    const width = 900 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    const parseDate = d3.timeParse('%Y-%m-%d');
    const filtered = fitbitData.filter((d) => {
      const dDate = new Date(d.date);
      return (!startDate || dDate >= startDate) && (!endDate || dDate <= endDate);
    });

    const x = d3
      .scaleTime()
      .domain(d3.extent(filtered, (d) => parseDate(d.date)!) as [Date, Date])
      .range([0, width]);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(filtered, (d) => d.floors || 0) || 10])
      .range([height, 0])
      .nice();

    const chart = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    chart
      .append('g')
      .attr('transform', `translate(0,${height})`)
      .call(
        d3
          .axisBottom(x)
          .ticks(6)
          .tickFormat(d3.timeFormat('%b %d') as any)
      );

    chart.append('g').call(d3.axisLeft(y));

    const line = d3
      .line<FitbitEntry>()
      .defined((d) => d.floors !== undefined)
      .x((d) => x(parseDate(d.date)!))
      .y((d) => y(d.floors!));

    const tooltip = d3
      .select('body')
      .append('div')
      .attr('class', 'tooltip bg-light border p-2 position-absolute')
      .style('opacity', 0)
      .style('pointer-events', 'none');

    chart
      .append('path')
      .datum(filtered.filter(line.defined()))
      .attr('fill', 'none')
      .attr('stroke', '#17becf')
      .attr('stroke-width', 2)
      .attr('d', line);

    chart
      .selectAll('circle')
      .data(filtered.filter(line.defined()))
      .enter()
      .append('circle')
      .attr('cx', (d) => x(parseDate(d.date)!))
      .attr('cy', (d) => y(d.floors!))
      .attr('r', 4)
      .attr('fill', '#17becf')
      .on('mouseover', function (event, d) {
        tooltip
          .html(`<strong>${d.date}</strong><br/>Value: ${d.floors}`)
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 20}px`)
          .style('opacity', 1);
      })
      .on('mousemove', function (event) {
        tooltip.style('left', `${event.pageX + 10}px`).style('top', `${event.pageY - 20}px`);
      })
      .on('mouseout', () => tooltip.style('opacity', 0));

    svg
      .append('text')
      .attr('x', width / 2 + margin.left)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .style('font-size', '16px')
      .text('Floors Climbed');
  };

  const drawSleepChart = () => {
    if (!svgRefSleep.current || !document.body.contains(svgRefSleep.current)) return;
    const svg = d3.select(svgRefSleep.current);
    d3.select(svgRefSleep.current).selectChildren().remove();  // ✅ safer

    const parseDate = d3.timeParse('%Y-%m-%d');
    const parseDateTime = d3.utcParse('%Y-%m-%dT%H:%M:%S.%L');
    const margin = { top: 40, right: 60, bottom: 50, left: 60 };
    const width = 900 - margin.left - margin.right;
    const height = 320 - margin.top - margin.bottom;

    const filtered = fitbitData.filter((d) => {
      const dDate = new Date(d.date);
      return (!startDate || dDate >= startDate) && (!endDate || dDate <= endDate);
    });

    const x = d3
      .scaleBand()
      .domain(filtered.map((d) => d.date))
      .range([0, width])
      .padding(0.2);

    const yTime = d3
      .scaleTime()
      .domain([new Date('2000-01-01T18:00:00'), new Date('2000-01-02T12:00:00')])
      .range([0, height]);

    const yDuration = d3
      .scaleLinear()
      .domain([
        0,
        d3.max(filtered, (d) => (d.sleep?.sleep_duration ? d.sleep.sleep_duration / 3600000 : 0)) ||
          8,
      ])
      .range([height, 0]);

    const chart = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    chart
      .append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat((d) => d.slice(5)));

    chart.append('g').call(d3.axisLeft(yTime).tickFormat(d3.timeFormat('%I:%M %p') as any));
    chart.append('g').attr('transform', `translate(${width},0)`).call(d3.axisRight(yDuration));

    const tooltip = d3
      .select('body')
      .append('div')
      .style('position', 'absolute')
      .style('background', 'rgba(0,0,0,0.7)')
      .style('color', 'white')
      .style('padding', '5px')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0);

    // Sleep bars
    chart
      .selectAll('rect.sleep')
      .data(filtered)
      .enter()
      .append('rect')
      .attr('x', (d) => x(d.date)!)
      .attr('y', (d) => {
        const start = d.sleep?.sleep_start ? parseDateTime(d.sleep.sleep_start) : null;
        return start ? yTime(new Date('2000-01-01T' + start.toISOString().slice(11, 19))) : 0;
      })
      .attr('height', (d) => {
        const start = d.sleep?.sleep_start ? parseDateTime(d.sleep.sleep_start) : null;
        const end = d.sleep?.sleep_end ? parseDateTime(d.sleep.sleep_end) : null;
        if (start && end) {
          const fakeStart = new Date('2000-01-01T' + start.toISOString().slice(11, 19));
          const fakeEnd = new Date('2000-01-01T' + end.toISOString().slice(11, 19));
          if (fakeEnd < fakeStart) fakeEnd.setDate(fakeEnd.getDate() + 1);
          return yTime(fakeEnd) - yTime(fakeStart);
        }
        return 0;
      })
      .attr('width', x.bandwidth())
      .attr('fill', '#9370DB')
      .attr('opacity', 0.7)
      .on('mouseover', function (event, d) {
        tooltip
          .html(
            `Start: ${d.sleep?.sleep_start?.slice(11, 16)}<br/>End: ${d.sleep?.sleep_end?.slice(11, 16)}`
          )
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 20}px`)
          .style('opacity', 1);
      })
      .on('mousemove', function (event) {
        tooltip.style('left', `${event.pageX + 10}px`).style('top', `${event.pageY - 20}px`);
      })
      .on('mouseout', () => tooltip.style('opacity', 0));

    // Line and dots for sleep duration
    const durationData = filtered.filter((d) => d.sleep?.sleep_duration);

    const line = d3
      .line<any>()
      .defined((d) => d.sleep?.sleep_duration)
      .x((d) => x(d.date)! + x.bandwidth() / 2)
      .y((d) => yDuration(d.sleep.sleep_duration / 3600000));

    chart
      .append('path')
      .datum(durationData)
      .attr('fill', 'none')
      .attr('stroke', '#ff7f0e')
      .attr('stroke-width', 2)
      .attr('d', line);

    chart
      .selectAll('circle.duration')
      .data(durationData)
      .enter()
      .append('circle')
      .attr('class', 'duration')
      .attr('cx', (d) => x(d.date)! + x.bandwidth() / 2)
      .attr('cy', (d) => yDuration(d.sleep.sleep_duration / 3600000))
      .attr('r', 4)
      .attr('fill', '#ff7f0e')
      .on('mouseover', function (event, d) {
        tooltip
          .html(`Date: ${d.date}<br/>Duration: ${(d.sleep.sleep_duration / 3600000).toFixed(2)} h`)
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 20}px`)
          .style('opacity', 1);
      })
      .on('mousemove', function (event) {
        tooltip.style('left', `${event.pageX + 10}px`).style('top', `${event.pageY - 20}px`);
      })
      .on('mouseout', () => tooltip.style('opacity', 0));

    svg
      .append('text')
      .attr('x', width / 2 + margin.left)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .style('font-size', '16px')
      .text('Sleep Schedule and Duration');
  };

  const drawFitbitChart = () => {
    if (!svgRefFitbit.current || !document.body.contains(svgRefFitbit.current)) return;
    const svg = d3.select(svgRefFitbit.current);
    d3.select(svgRefFitbit.current).selectChildren().remove();  // ✅ safer


    const margin = { top: 40, right: 30, bottom: 50, left: 50 };
    const width = 900 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    const parseDate = d3.timeParse('%Y-%m-%d');
    const filtered = fitbitData.filter((d) => {
      const dDate = new Date(d.date);
      return (
        (!startDate || dDate >= startDate) &&
        (!endDate || dDate <= endDate) &&
        d.resting_heart_rate !== undefined
      );
    });

    const x = d3
      .scaleTime()
      .domain(d3.extent(filtered, (d) => parseDate(d.date)!) as [Date, Date])
      .range([0, width]);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(filtered, (d) => d.resting_heart_rate || 0) || 100])
      .nice()
      .range([height, 0]);

    const chart = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    chart
      .append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.timeFormat('%b %d') as any));

    chart.append('g').call(d3.axisLeft(y));

    const line = d3
      .line<FitbitEntry>()
      .defined((d) => d.resting_heart_rate !== undefined)
      .x((d) => x(parseDate(d.date)!))
      .y((d) => y(d.resting_heart_rate!));

    chart
      .append('path')
      .datum(filtered)
      .attr('fill', 'none')
      .attr('stroke', '#ff7f0e')
      .attr('stroke-width', 2)
      .attr('d', line);

    const tooltip = d3
      .select('body')
      .append('div')
      .attr('class', 'tooltip bg-light border p-2 position-absolute')
      .style('opacity', 0)
      .style('pointer-events', 'none');

    chart
      .selectAll('circle')
      .data(filtered)
      .enter()
      .append('circle')
      .attr('cx', (d) => x(parseDate(d.date)!))
      .attr('cy', (d) => y(d.resting_heart_rate!))
      .attr('r', 4)
      .attr('fill', '#ff7f0e')
      .on('mouseover', function (event, d) {
        tooltip
          .html(`<strong>${d.date}</strong><br/>Resting HR: ${d.resting_heart_rate} bpm`)
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 28}px`)
          .style('opacity', 1);
      })
      .on('mousemove', function (event) {
        tooltip.style('left', `${event.pageX + 10}px`).style('top', `${event.pageY - 28}px`);
      })
      .on('mouseout', () => tooltip.style('opacity', 0));

    svg
      .append('text')
      .attr('x', width / 2 + margin.left)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .style('font-size', '16px')
      .text('Resting Heart Rate');
  };

  const drawStepsChart = () => {
    if (!svgRefSteps.current || !document.body.contains(svgRefSteps.current)) return;

    const svg = d3.select(svgRefSteps.current);
    d3.select(svgRefSteps.current).selectChildren().remove();  // ✅ safer

    const margin = { top: 40, right: 30, bottom: 50, left: 50 };
    const width = 900 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    const parseDate = d3.timeParse('%Y-%m-%d');
    const filtered = fitbitData.filter((d) => {
      const dDate = new Date(d.date);
      return (!startDate || dDate >= startDate) && (!endDate || dDate <= endDate);
    });

    const x = d3
      .scaleTime()
      .domain(d3.extent(filtered, (d) => parseDate(d.date)!) as [Date, Date])
      .range([0, width]);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(filtered, (d) => d.steps || 0) || 10000])
      .nice()
      .range([height, 0]);

    const chart = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    chart
      .append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.timeFormat('%b %d') as any));

    chart.append('g').call(d3.axisLeft(y));

    const line = d3
      .line<FitbitEntry>()
      .defined((d) => d.steps !== undefined)
      .x((d) => x(parseDate(d.date)!))
      .y((d) => y(d.steps!));

    const tooltip = d3
      .select('body')
      .append('div')
      .attr('class', 'tooltip bg-light border p-2 position-absolute')
      .style('opacity', 0)
      .style('pointer-events', 'none');

    chart
      .append('path')
      .datum(filtered.filter(line.defined()))
      .attr('fill', 'none')
      .attr('stroke', '#2ca02c')
      .attr('stroke-width', 2)
      .attr('d', line);

    chart
      .selectAll('circle')
      .data(filtered.filter(line.defined()))
      .enter()
      .append('circle')
      .attr('cx', (d) => x(parseDate(d.date)!))
      .attr('cy', (d) => y(d.steps!))
      .attr('r', 4)
      .attr('fill', '#2ca02c')
      .on('mouseover', function (event, d) {
        tooltip
          .html(`<strong>${d.date}</strong><br/>Value: ${d.steps}`)
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 20}px`)
          .style('opacity', 1);
      })
      .on('mousemove', function (event) {
        tooltip.style('left', `${event.pageX + 10}px`).style('top', `${event.pageY - 20}px`);
      })
      .on('mouseout', () => tooltip.style('opacity', 0));

    svg
      .append('text')
      .attr('x', width / 2 + margin.left)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .style('font-size', '16px')
      .text('Daily Steps');
  };
  const drawHeartRateZoneChart = () => {
    if (!svgRefHRZones.current || !document.body.contains(svgRefHRZones.current)) return;
    const svg = d3.select(svgRefHRZones.current);
    d3.select(svgRefHRZones.current).selectChildren().remove();  // ✅ safer

    const parseDate = d3.timeParse('%Y-%m-%d');
    const margin = { top: 40, right: 30, bottom: 50, left: 50 };
    const width = 900 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    const chart = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const keys = ['Out of Range', 'Fat Burn', 'Cardio', 'Peak'];
    const colors = d3.scaleOrdinal<string>().domain(keys).range(d3.schemeCategory10);

    const data = fitbitData
      .filter((d) => d.heart_rate_zones && d.heart_rate_zones.length > 0)
      .map((d) => {
        const zoneMap = Object.fromEntries(d.heart_rate_zones.map((z) => [z.name, z.minutes]));
        const base: any = { date: d.date };
        keys.forEach((k) => (base[k] = zoneMap[k] || 0));
        return base;
      });

    const stackedData = d3.stack().keys(keys)(data);

    const x = d3
      .scaleBand()
      .domain(data.map((d) => d.date))
      .range([0, width])
      .padding(0.2);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => keys.reduce((sum, k) => sum + d[k], 0))!])
      .nice()
      .range([height, 0]);

    chart
      .append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat((d) => d.slice(5)));

    chart.append('g').call(d3.axisLeft(y));

    const tooltip = d3
      .select(svgRefHRZones.current!.parentElement)
      .append('div')
      .style('position', 'absolute')
      .style('background', 'rgba(0,0,0,0.7)')
      .style('color', 'white')
      .style('padding', '5px')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0);

    chart
      .selectAll('g.layer')
      .data(stackedData)
      .enter()
      .append('g')
      .attr('fill', (d) => colors(d.key))
      .selectAll('rect')
      .data((d) => d.map((p) => ({ ...p, key: d.key })))
      .enter()
      .append('rect')
      .attr('x', (d) => x(d.data.date)!)
      .attr('y', (d) => y(d[1]))
      .attr('height', (d) => y(d[0]) - y(d[1]))
      .attr('width', x.bandwidth())
      .on('mouseover', function (event, d) {
        tooltip
          .html(`<strong>${d.key}</strong><br/>Minutes: ${d.data[d.key]}`)
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 20}px`)
          .style('opacity', 1);
      })
      .on('mousemove', function (event) {
        tooltip.style('left', `${event.pageX + 10}px`).style('top', `${event.pageY - 20}px`);
      })
      .on('mouseout', () => tooltip.style('opacity', 0));

    svg
      .append('text')
      .attr('x', width / 2 + margin.left)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .style('font-size', '16px')
      .text('Heart Rate Zones per Day');
  };

  const drawQuestionnaireTotalScoreChart = () => {
    if (!svgRefTotalScore.current || !document.body.contains(svgRefTotalScore.current)) return;
    const svg = d3.select(svgRefTotalScore.current);
    d3.select(svgRefTotalScore.current).selectChildren().remove();  // ✅ safer

    const margin = { top: 40, right: 30, bottom: 50, left: 50 };
    const width = 900 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    const parseDate = d3.timeParse('%Y-%m-%dT%H:%M:%S.%L');
    const grouped = d3.groups(questionnaireData, (d) => d.date.slice(0, 10));
    const summedScores = grouped.map(([date, entries]) => ({
      date,
      score: d3.sum(entries, (e) => parseInt(e.answers?.[0]?.key || '0')),
    }));

    const x = d3
      .scaleTime()
      .domain(d3.extent(summedScores, (d) => parseDate(d.date)) as [Date, Date])
      .range([0, width]);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(summedScores, (d) => d.score) || 50])
      .nice()
      .range([height, 0]);

    const chart = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    chart
      .append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.timeFormat('%b %d') as any));

    chart.append('g').call(d3.axisLeft(y));

    const line = d3
      .line<{ date: string; score: number }>()
      .x((d) => x(parseDate(d.date)!))
      .y((d) => y(d.score));

    chart
      .append('path')
      .datum(summedScores)
      .attr('fill', 'none')
      .attr('stroke', '#1f77b4')
      .attr('stroke-width', 2)
      .attr('d', line);

    chart
      .selectAll('circle')
      .data(summedScores)
      .enter()
      .append('circle')
      .attr('cx', (d) => x(parseDate(d.date)!))
      .attr('cy', (d) => y(d.score))
      .attr('r', 4)
      .attr('fill', '#1f77b4')
      .append('title')
      .text((d) => `Date: ${d.date}\nScore: ${d.score}`);

    svg
      .append('text')
      .attr('x', width / 2 + margin.left)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .style('font-size', '16px')
      .text('Total Questionnaire Score Per Day');
  };
  const drawQuestionnaireLinesChart = () => {
    if (!svgRefQuestionnaire.current || !document.body.contains(svgRefQuestionnaire.current)) return;

    const svg = d3.select(svgRefQuestionnaire.current);
    d3.select(svgRefQuestionnaire.current).selectChildren().remove();  // ✅ safer

    const margin = { top: 20, right: 30, bottom: 50, left: 50 };
    const width = 900 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    const parseDate = d3.timeParse('%Y-%m-%dT%H:%M:%S.%L');

    const grouped = d3.group(questionnaireData, (d) => d.questionKey);
    const color = d3.scaleOrdinal(d3.schemeCategory10).domain(Array.from(grouped.keys()));

    const allDates = [...new Set(questionnaireData.map((d) => d.date.slice(0, 10)))];
    const x = d3
      .scaleTime()
      .domain(d3.extent(allDates, (d) => parseDate(d)) as [Date, Date])
      .range([0, width]);

    const y = d3.scaleLinear().domain([0, 5]).range([height, 0]);

    const chart = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    chart
      .append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.timeFormat('%b %d') as any));
    chart.append('g').call(d3.axisLeft(y));

    const controls = d3.select('#question-controls');
    controls.selectAll('*').remove();

    const visible = new Set<string>(Array.from(grouped.keys()));

    function update() {
      chart.selectAll('.line').remove();
      chart.selectAll('.dot').remove();

      Array.from(grouped.entries()).forEach(([key, values]) => {
        if (!visible.has(key)) return;

        const line = d3
          .line<QuestionnaireEntry>()
          .defined((d) => !isNaN(Number(d.answers?.[0]?.key)))
          .x((d) => x(parseDate(d.date)!))
          .y((d) => y(Number(d.answers?.[0]?.key)));

        chart
          .append('path')
          .datum(values.filter(line.defined()))
          .attr('class', 'line')
          .attr('fill', 'none')
          .attr('stroke', color(key)!)
          .attr('stroke-width', 2)
          .attr('d', line);

        chart
          .selectAll(`.dot-${key}`)
          .data(values.filter(line.defined()))
          .enter()
          .append('circle')
          .attr('class', 'dot')
          .attr('cx', (d) => x(parseDate(d.date)!))
          .attr('cy', (d) => y(Number(d.answers?.[0]?.key)))
          .attr('r', 4)
          .attr('fill', color(key)!)
          .append('title')
          .text((d) => {
            const qText =
              d.questionTranslations?.find((t) => t.language === i18n.language)?.text ||
              d.questionTranslations?.find((t) => t.language === 'en')?.text ||
              key;

            const answerKey = d.answers?.[0]?.key;
            const translatedAnswer =
              d.answers?.[0]?.translations?.find((t) => t.language === i18n.language)?.text ||
              d.answers?.[0]?.translations?.find((t) => t.language === 'en')?.text ||
              answerKey;

            return `${qText}: ${translatedAnswer}`;
          });
      });
    }

    Array.from(grouped.keys()).forEach((key) => {
      const sample = questionnaireData.find((d) => d.questionKey === key);
      const translated =
        sample?.questionTranslations?.find((t) => t.language === i18n.language)?.text ||
        sample?.questionTranslations?.find((t) => t.language === 'en')?.text ||
        key;

      const label = controls
        .append('div')
        .style('cursor', 'pointer')
        .style('margin', '6px 0')
        .style('font-weight', 'bold')
        .style('color', color(key)!)
        .text(translated)
        .attr('title', key)
        .on('click', function () {
          if (visible.has(key)) {
            visible.delete(key);
            label.style('opacity', 0.4).style('text-decoration', 'line-through');
          } else {
            visible.add(key);
            label.style('opacity', 1).style('text-decoration', 'none');
          }
          update();
        });
    });

    update();
  };

  const drawExerciseStackedBar = (exerciseData: any[], containerId: string) => {
    if (!document.querySelector(containerId) || !document.body.contains(document.querySelector(containerId))) return;

    const margin = { top: 40, right: 30, bottom: 50, left: 60 };
    const width = 900 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    // Clear previous SVG content
    const svg = d3.select(containerId);
    svg.selectAll('*').remove();

    const chart = svg
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const parseDate = d3.timeParse('%Y-%m-%d');

    // Flatten into structure: [{ date, Walk: 20, Run: 10, ... }, ...]
    const aggregated: Record<string, Record<string, number>> = {};
    exerciseData.forEach(({ date, exercise }) => {
      const entry = aggregated[date] || {};
      if (Array.isArray(exercise)) {
        exercise.forEach((ex: any) => {
          entry[ex.name] = (entry[ex.name] || 0) + ex.duration / 60000; // ms → min
        });
      }
      aggregated[date] = entry;
    });

    const dates = Object.keys(aggregated).sort();
    const types = Array.from(
      new Set(
        exerciseData.flatMap((d) =>
          Array.isArray(d.exercise) ? d.exercise.map((e: any) => e.name) : []
        )
      )
    );

    const stackedData = dates.map((date) => {
      const base = { date };
      types.forEach((type) => {
        base[type] = aggregated[date]?.[type] || 0;
      });
      return base;
    });

    const x = d3.scaleBand().domain(dates).range([0, width]).padding(0.2);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(stackedData, (d: any) => d3.sum(types, (t) => d[t])) || 0])
      .nice()
      .range([height, 0]);

    const color = d3.scaleOrdinal(d3.schemeTableau10).domain(types);

    const stack = d3.stack().keys(types);
    const series = stack(stackedData as any);

    chart
      .append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat((d) => d.slice(5)))
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end');

    chart.append('g').call(d3.axisLeft(y));

    const tooltip = d3
      .select('body')
      .append('div')
      .attr('class', 'tooltip bg-light border p-2 position-absolute')
      .style('opacity', 0)
      .style('pointer-events', 'none');

    chart
      .selectAll('g.layer')
      .data(series)
      .join('g')
      .attr('fill', (d) => color(d.key)!)
      .selectAll('rect')
      .data((d) => d.map((v) => ({ ...v, key: d.key })))
      .join('rect')
      .attr('x', (d: any) => x(d.data.date)!)
      .attr('y', (d) => y(d[1]))
      .attr('height', (d) => y(d[0]) - y(d[1]))
      .attr('width', x.bandwidth())
      .on('mouseover', (event, d: any) => {
        tooltip
          .style('opacity', 1)
          .html(`<strong>${d.key}</strong><br/>${d.data.date}: ${Math.round(d.data[d.key])} min`);
      })
      .on('mousemove', (event) => {
        tooltip.style('left', event.pageX + 10 + 'px').style('top', event.pageY - 28 + 'px');
      })
      .on('mouseout', () => tooltip.style('opacity', 0));

    svg
      .append('text')
      .attr('x', width / 2 + margin.left)
      .attr('y', 25)
      .attr('text-anchor', 'middle')
      .style('font-size', '16px')
      .text('Exercise Duration by Type (minutes)');
  };
useEffect(() => {
  const [start, end] = calculateDateRange();
  setStartDate(start);
  setEndDate(end);
}, [referenceDate, viewMode]);

useEffect(() => {
  authStore.checkAuthentication();
  if (!authStore.isAuthenticated) navigate('/');
  fetchData();
}, []);

useEffect(() => {
  if (!startDate || !endDate) return;

  if (
    !fetchedRange.current ||
    startDate < fetchedRange.current.from ||
    endDate > fetchedRange.current.to
  ) {
    fetchData(startDate, endDate);
  }
}, [startDate, endDate]);

useEffect(() => {
  let frameId: number;

  frameId = requestAnimationFrame(() => {
    try {
      drawFitbitChart();
      drawSleepChart();
      if (questionnaireData.length) {
        drawQuestionnaireTotalScoreChart();
        drawQuestionnaireLinesChart();
      }
      drawHeartRateZoneChart();
      drawFloorsChart();
      drawStepsChart();
      drawDistanceChart();
      drawBreathingRateChart();
      drawHRVChart();
      drawExerciseStackedBar(fitbitData, '#exerciseBarSvg');
    } catch (e) {
      console.error("Chart drawing failed:", e);
    }
  });

  return () => {
    cancelAnimationFrame(frameId);
  };
}, [fitbitData, questionnaireData, startDate, endDate, visibleFitbit, visibleQuestions]);
const exportPlotsAsCSV = () => {
  let csvContent = '';
  const delimiter = ';';

  if (exportSelections.totalScore && questionnaireData.length) {
    csvContent += 'Date;Total Score\n';
    const grouped = d3.groups(questionnaireData, (d) => d.date.slice(0, 10));
    for (const [date, entries] of grouped) {
      const score = d3.sum(entries, (e) => parseInt(e.answers?.[0]?.key || '0'));
      csvContent += `${date}${delimiter}${score}\n`;
    }
    csvContent += '\n';
  }

  if (exportSelections.questionnaire) {
    csvContent += 'Date;Question Key;Answer Key;Answer Text\n';
    for (const entry of questionnaireData) {
      if (!visibleQuestions[entry.questionKey]) continue;
      const key = entry.answers?.[0]?.key ?? '';
      const text =
        entry.answers?.[0]?.translations?.find((t) => t.language === i18n.language)?.text ||
        entry.answers?.[0]?.translations?.find((t) => t.language === 'en')?.text ||
        key;
      csvContent += `${entry.date}${delimiter}${entry.questionKey}${delimiter}${key}${delimiter}${text}\n`;
    }
    csvContent += '\n';
  }

  if (exportSelections.restingHR && fitbitData.length) {
    csvContent += 'Date;Resting Heart Rate\n';
    fitbitData.forEach((d) => {
      if (d.resting_heart_rate !== undefined) {
        csvContent += `${d.date}${delimiter}${d.resting_heart_rate}\n`;
      }
    });
    csvContent += '\n';
  }

  if (exportSelections.steps) {
    csvContent += 'Date;Steps\n';
    fitbitData.forEach((d) => {
      if (d.steps !== undefined) {
        csvContent += `${d.date}${delimiter}${d.steps}\n`;
      }
    });
    csvContent += '\n';
  }

  if (exportSelections.distance) {
    csvContent += 'Date;Distance\n';
    fitbitData.forEach((d) => {
      if (d.distance !== undefined) {
        csvContent += `${d.date}${delimiter}${d.distance}\n`;
      }
    });
    csvContent += '\n';
  }

  if (exportSelections.floors) {
    csvContent += 'Date;Floors\n';
    fitbitData.forEach((d) => {
      if (d.floors !== undefined) {
        csvContent += `${d.date}${delimiter}${d.floors}\n`;
      }
    });
    csvContent += '\n';
  }

  if (exportSelections.breathing) {
    csvContent += 'Date;Breathing Rate\n';
    fitbitData.forEach((d) => {
      if (d.breathing_rate?.breathingRate !== undefined) {
        csvContent += `${d.date}${delimiter}${d.breathing_rate.breathingRate}\n`;
      }
    });
    csvContent += '\n';
  }

  if (exportSelections.hrv) {
    csvContent += 'Date;HRV (dailyRmssd)\n';
    fitbitData.forEach((d) => {
      if (d.hrv?.dailyRmssd !== undefined) {
        csvContent += `${d.date}${delimiter}${d.hrv.dailyRmssd}\n`;
      }
    });
    csvContent += '\n';
  }

  if (exportSelections.sleep) {
    csvContent += 'Date;Sleep Start;Sleep End;Duration (h)\n';
    fitbitData.forEach((d) => {
      if (d.sleep?.sleep_duration !== undefined) {
        const durationH = (d.sleep.sleep_duration / 3600000).toFixed(2);
        csvContent += `${d.date}${delimiter}${d.sleep.sleep_start}${delimiter}${d.sleep.sleep_end}${delimiter}${durationH}\n`;
      }
    });
    csvContent += '\n';
  }

  if (exportSelections.hrZones) {
    csvContent += 'Date;Zone;Minutes\n';
    fitbitData.forEach((d) => {
      (d.heart_rate_zones || []).forEach((z) => {
        csvContent += `${d.date}${delimiter}${z.name}${delimiter}${z.minutes}\n`;
      });
    });
    csvContent += '\n';
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, `HealthCharts_${startDate?.toISOString().slice(0, 10)}_to_${endDate?.toISOString().slice(0, 10)}.csv`);
};

const svgToImageDataUrl = (svgElement: SVGSVGElement): Promise<string> => {
  return new Promise((resolve) => {
    const svgString = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = svgElement.clientWidth;
      canvas.height = svgElement.clientHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff'; // Optional: white background
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } else {
        resolve('');
      }
      URL.revokeObjectURL(url);
    };
    image.src = url;
  });
};
const exportPlotsAsPDF = async () => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'px', format: 'a4' });

  const charts = [
    { ref: svgRefTotalScore, key: 'totalScore', title: 'Total Questionnaire Score Per Day' },
    { ref: svgRefQuestionnaire, key: 'questionnaire', title: 'Questionnaire Answers Over Time' },
    { ref: svgRefFitbit, key: 'restingHR', title: 'Resting Heart Rate' },
    { ref: svgRefSleep, key: 'sleep', title: 'Sleep Schedule and Duration' },
    { ref: svgRefHRZones, key: 'hrZones', title: 'Heart Rate Zones per Day' },
    { ref: svgRefFloors, key: 'floors', title: 'Floors Climbed' },
    { ref: svgRefSteps, key: 'steps', title: 'Daily Steps' },
    { ref: svgRefDistance, key: 'distance', title: 'Distance Traveled' },
    { ref: svgRefBreathing, key: 'breathing', title: 'Breathing Rate' },
    { ref: svgRefHRV, key: 'hrv', title: 'Heart Rate Variability (dailyRmssd in ms)' }
  ];

  let pageIndex = 0;

  for (const { ref, key, title } of charts) {
    if (!exportSelections[key]) continue;

    const svg = ref.current;
    if (!svg) continue;

    const dataUrl = await svgToImageDataUrl(svg);
    if (pageIndex > 0) doc.addPage();

    const pageWidth = doc.internal.pageSize.getWidth();
    const imgWidth = pageWidth - 60;
    const imgHeight = (svg.clientHeight / svg.clientWidth) * imgWidth;

    doc.text(title, pageWidth / 2, 30, { align: 'center' });
    doc.addImage(dataUrl, 'PNG', 30, 50, imgWidth, imgHeight);
    pageIndex++;
  }

  doc.save(`HealthCharts_${startDate?.toISOString().slice(0, 10)}_to_${endDate?.toISOString().slice(0, 10)}.pdf`);
};



const exportCSV = () => {
  const rows: string[][] = [];

  rows.push(['Fitbit Data']);
  rows.push(['Date', 'Steps', 'Resting HR', 'Floors', 'Distance', 'Calories', 'Active Minutes', 'Breathing Rate', 'HRV']);

  fitbitData.forEach(entry => {
    rows.push([
      entry.date,
      String(entry.steps ?? ''),
      String(entry.resting_heart_rate ?? ''),
      String(entry.floors ?? ''),
      String(entry.distance ?? ''),
      String(entry.calories ?? ''),
      String(entry.active_minutes ?? ''),
      String(entry.breathing_rate?.breathingRate ?? ''),
      String(entry.hrv?.dailyRmssd ?? '')
    ]);
  });

  rows.push([]);
  rows.push(['Questionnaire Data']);
  rows.push(['Date', 'Question Key', 'Question', 'Answer', 'Comment']);

  questionnaireData.forEach(entry => {
    const question = entry.questionTranslations.find(t => t.language === i18n.language)?.text ||
                     entry.questionTranslations.find(t => t.language === 'en')?.text || entry.questionKey;

    const answer = entry.answers?.[0]?.translations?.find(t => t.language === i18n.language)?.text ||
                   entry.answers?.[0]?.translations?.find(t => t.language === 'en')?.text ||
                   entry.answers?.[0]?.key;

    rows.push([entry.date, entry.questionKey, question, answer, '']);
  });

  const csvContent = rows.map(e => e.join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, `HealthData_${startDate?.toISOString().slice(0,10)}_to_${endDate?.toISOString().slice(0,10)}.csv`);
};
const exportPDF = () => {
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text(`Health Data Report`, 14, 16);
  doc.setFontSize(10);
  doc.text(`Date range: ${startDate?.toLocaleDateString()} – ${endDate?.toLocaleDateString()}`, 14, 24);

  // Fitbit table
  doc.autoTable({
    head: [['Date', 'Steps', 'Resting HR', 'Floors', 'Distance', 'Calories', 'Active Min', 'Breathing Rate', 'HRV']],
    body: fitbitData.map(d => [
      d.date,
      d.steps ?? '',
      d.resting_heart_rate ?? '',
      d.floors ?? '',
      d.distance ?? '',
      d.calories ?? '',
      d.active_minutes ?? '',
      d.breathing_rate?.breathingRate ?? '',
      d.hrv?.dailyRmssd ?? ''
    ]),
    startY: 30,
    styles: { fontSize: 8 }
  });

  // Questionnaire
  doc.addPage();
  doc.setFontSize(14);
  doc.text('Questionnaire Responses', 14, 16);
  doc.autoTable({
    head: [['Date', 'Question', 'Answer']],
    body: questionnaireData.map((entry) => {
      const question = entry.questionTranslations.find(t => t.language === i18n.language)?.text ||
                       entry.questionTranslations.find(t => t.language === 'en')?.text || entry.questionKey;

      const answer = entry.answers?.[0]?.translations?.find(t => t.language === i18n.language)?.text ||
                     entry.answers?.[0]?.translations?.find(t => t.language === 'en')?.text ||
                     entry.answers?.[0]?.key;

      return [entry.date, question, answer];
    }),
    startY: 24,
    styles: { fontSize: 8 }
  });

  doc.save(`HealthReport_${startDate?.toISOString().slice(0,10)}_to_${endDate?.toISOString().slice(0,10)}.pdf`);
};

  const questionMetaMap = useMemo(() => {
    const map: Record<string, { label: string; key: string }> = {};
    for (const entry of questionnaireData) {
      if (!entry.questionKey || map[entry.questionKey]) continue;
      const label =
        entry.questionTranslations?.find((t) => t.language === i18n.language)?.text ||
        entry.questionTranslations?.find((t) => t.language === 'en')?.text ||
        entry.questionKey;
      map[entry.questionKey] = { label, key: entry.questionKey };
    }
    return map;
  }, [questionnaireData, i18n.language]);

  return (
    <div className="d-flex flex-column min-vh-100">
  <Header isLoggedIn={authStore.isAuthenticated} />
  <Container fluid className="mt-4">

    

    {/* Date Range Display */}
<Row className="mb-4 justify-content-center">
  <Col xs="auto">
    <div className="d-flex align-items-center justify-content-center gap-3">
      <Button onClick={goToPrevious} variant="outline-primary" size="sm">
        &larr;
      </Button>

      <h5 className="fw-semibold text-muted mb-0">
        {startDate?.toLocaleDateString()} &mdash; {endDate?.toLocaleDateString()}
      </h5>

      <Button onClick={goToNext} variant="outline-primary" size="sm">
        &rarr;
      </Button>
    </div>
  </Col>
</Row>


<Row className="mb-4 align-items-end">
  {/* View Mode Dropdown */}
  <Col md={3}>
    <Form.Group>
      <Form.Label className="fw-bold">View Mode</Form.Label>
      <Form.Select
        value={viewMode}
        onChange={(e) => setViewMode(e.target.value as 'weekly' | 'monthly')}
      >
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </Form.Select>
    </Form.Group>
  </Col>

  {/* OR Separator */}
  <Col md={1} className="text-center">
    <div className="fw-bold text-muted mb-2">or</div>
  </Col>

<Col md={8}>
  <Row>
    {/* From Date Picker */}
    <Col md={2}>
      <Form.Group>
        <Form.Label className="fw-bold">From</Form.Label>
        <DatePicker
          selected={startDate}
          onChange={setStartDate}
          placeholderText="Pick a start date"
          className="form-control"
          dateFormat="yyyy-MM-dd"
        />
      </Form.Group>
    </Col>

    {/* To Date Picker */}
    <Col md={2}>
      <Form.Group>
        <Form.Label className="fw-bold">To</Form.Label>
        <DatePicker
          selected={endDate}
          onChange={setEndDate}
          placeholderText="Pick an end date"
          className="form-control"
          dateFormat="yyyy-MM-dd"
        />
      </Form.Group>
    </Col>
  </Row>
</Col>
 </Row>



{/* Export + Select Section */}
    <Row className="mb-4 align-items-center">
  <Col md={7}>
    <Form.Group>
      {/* Label Row */}
      <div className="mb-2">
        <Form.Label><strong>Select Plots to Export</strong></Form.Label>
      </div>

      {/* Select All Toggle on its own row */}
      <div className="mb-3">
        <span
          className={`badge rounded-pill px-3 py-2 ${
            Object.values(exportSelections).every(Boolean)
              ? 'bg-success text-white'
              : 'bg-light text-success border border-success'
          }`}
          style={{ cursor: 'pointer', userSelect: 'none' }}
          onClick={() => {
            const allSelected = Object.values(exportSelections).every(Boolean);
            const newSelections = Object.fromEntries(
              Object.keys(exportSelections).map((key) => [key, !allSelected])
            );
            setExportSelections(newSelections);
          }}
        >
          Select All
        </span>
      </div>

      {/* Badge Toggles */}
      <div className="d-flex flex-wrap gap-2">
        {[
          { id: 'totalScore', label: 'Total Score' },
          { id: 'questionnaire', label: 'Questionnaire Lines' },
          { id: 'restingHR', label: 'Resting Heart Rate' },
          { id: 'sleep', label: 'Sleep' },
          { id: 'hrZones', label: 'Heart Rate Zones' },
          { id: 'floors', label: 'Floors Climbed' },
          { id: 'steps', label: 'Steps' },
          { id: 'distance', label: 'Distance' },
          { id: 'breathing', label: 'Breathing Rate' },
          { id: 'hrv', label: 'HRV' }
        ].map(({ id, label }) => {
          const isSelected = exportSelections[id];
          return (
            <span
              key={id}
              className={`badge rounded-pill px-3 py-2 ${
                isSelected ? 'bg-primary text-white' : 'bg-light text-primary border border-primary'
              }`}
              style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={() =>
                setExportSelections((prev) => ({ ...prev, [id]: !prev[id] }))
              }
            >
              {label}
            </span>
          );
        })}
      </div>
    </Form.Group>
  </Col>

  <Col md={5} className="text-end">
    <div className="d-flex flex-wrap justify-content-end gap-2 mt-3">
      <Button variant="outline-secondary" onClick={exportPlotsAsCSV}>
        <i className="bi bi-file-earmark-spreadsheet"></i> Export CSV
      </Button>
      <Button variant="outline-primary" onClick={exportPlotsAsPDF}>
        <i className="bi bi-file-earmark-pdf"></i> Export PDF
      </Button>
    </div>
  </Col>
</Row>





        {error && <div className="alert alert-danger">{error}</div>}
<Accordion defaultActiveKey="0" className="mb-4">
  <Accordion.Item eventKey="0">
    <Accordion.Header>Summary of Questionaire Scores</Accordion.Header>
    <Accordion.Body>
        <svg ref={svgRefTotalScore} width={960} height={350} className="mb-5" />
 </Accordion.Body>
  </Accordion.Item>
  <Accordion.Item eventKey="1">
    <Accordion.Header>Questions</Accordion.Header>
    <Accordion.Body>
        <Row className="mb-4">
          <Col xs={3}>
            <div
              id="question-controls"
              style={{
                maxHeight: '400px',
                overflowY: 'auto',
              }}
            >
              {Object.entries(visibleQuestions).map(([key, val], idx) => {
                const meta = questionMetaMap[key] || { label: key, key };
                const color = d3.schemeCategory10[idx % 10];

                return (
                  <Form.Check
                    key={key}
                    type="checkbox"
                    label={
                      <span style={{ color: color, fontWeight: val ? 'bold' : 'normal' }}>
                        {meta.label}
                      </span>
                    }
                    title={meta.key} // ← shows the key on hover
                    checked={val}
                    onChange={() => {
                      setVisibleQuestions((prev) => ({
                        ...prev,
                        [key]: !prev[key],
                      }));
                    }}
                    style={{
                      borderLeft: `5px solid ${color}`,
                      paddingLeft: '8px',
                      marginBottom: '8px',
                    }}
                  />
                );
              })}
            </div>
          </Col>

          <Col xs={9}>
            <svg ref={svgRefQuestionnaire} width={900} height={400} />
          </Col>
        </Row>
</Accordion.Body>
</Accordion.Item>
 <Accordion.Item eventKey="2">
    <Accordion.Header>Resting HR</Accordion.Header>
    <Accordion.Body>
        <svg ref={svgRefFitbit} width={960} height={350} className="mb-5" />
        </Accordion.Body>
  </Accordion.Item>
   <Accordion.Item eventKey="3">
    <Accordion.Header>Sleep</Accordion.Header>
    <Accordion.Body>
        <svg ref={svgRefSleep} width={960} height={360} className="mb-5" />
        </Accordion.Body>
  </Accordion.Item>
  <Accordion.Item eventKey="4">
    <Accordion.Header>HR Zones</Accordion.Header>
    <Accordion.Body>
        <svg ref={svgRefHRZones} width={960} height={350} className="mb-5" />
        </Accordion.Body>
  </Accordion.Item>
  <Accordion.Item eventKey="5">
    <Accordion.Header>Floors</Accordion.Header>
    <Accordion.Body>
        <svg ref={svgRefFloors} width={960} height={350} className="mb-5" />
        </Accordion.Body>
  </Accordion.Item>
  <Accordion.Item eventKey="6">
    <Accordion.Header>Steps</Accordion.Header>
    <Accordion.Body>
        <svg ref={svgRefSteps} width={960} height={350} className="mb-5" />
        </Accordion.Body>
  </Accordion.Item>
  <Accordion.Item eventKey="7">
    <Accordion.Header>Distance</Accordion.Header>
    <Accordion.Body>
        <svg ref={svgRefDistance} width={960} height={350} className="mb-5" />
        </Accordion.Body>
  </Accordion.Item>
  <Accordion.Item eventKey="8">
    <Accordion.Header>Breathing</Accordion.Header>
    <Accordion.Body>
        <svg ref={svgRefBreathing} width={960} height={350} className="mb-5" />
        </Accordion.Body>
  </Accordion.Item>
  <Accordion.Item eventKey="9">
    <Accordion.Header>HRV</Accordion.Header>
    <Accordion.Body>
        <svg ref={svgRefHRV} width={960} height={350} className="mb-5" />
        </Accordion.Body>
  </Accordion.Item>
  <Accordion.Item eventKey="10">
    <Accordion.Header>Exercise</Accordion.Header>
    <Accordion.Body>

        <svg id="exerciseBarSvg" width={960} height={400} />
       </Accordion.Body>
  </Accordion.Item>
        </Accordion>
      </Container>
    </div>
  );
};

export default HealthPage;
