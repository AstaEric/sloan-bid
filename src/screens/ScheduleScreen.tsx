import { useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import type { Course, Section } from '../types';
import { STUDENT } from '../data/courses';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const START_HOUR = 9;
const END_HOUR = 18;
const TOTAL_HOURS = END_HOUR - START_HOUR;

function hourToPercent(hour: number) {
  return ((hour - START_HOUR) / TOTAL_HOURS) * 100;
}

function durationToPercent(start: number, end: number) {
  return ((end - start) / TOTAL_HOURS) * 100;
}

function formatHour(h: number) {
  const hh = Math.floor(h);
  const mm = h % 1 === 0.5 ? '30' : '00';
  const ampm = hh < 12 ? 'am' : 'pm';
  const display = hh > 12 ? hh - 12 : hh === 0 ? 12 : hh;
  return `${display}${mm === '00' ? '' : ':' + mm}${ampm}`;
}

interface PlacedBlock {
  course: Course;
  section: Section;
  day: string;
  tier: 'need' | 'nice';
  conflict: boolean;
}

export function ScheduleScreen() {
  const { needToHave, niceToHave, setScreen, bidPoints, setBidPoints } = useApp();

  // Auto-assign sections: pick first non-conflicting section
  const placedBlocks = useMemo<PlacedBlock[]>(() => {
    const blocks: PlacedBlock[] = [];
    const occupied: { day: string; start: number; end: number; courseId: string }[] = [];

    // Add obligatory blocks
    for (const ob of STUDENT.obligatoryBlocks) {
      occupied.push({ day: ob.day, start: ob.startHour, end: ob.endHour, courseId: 'obligatory' });
    }

    const processGroup = (courses: Course[], tier: 'need' | 'nice') => {
      for (const course of courses) {
        let placed = false;
        for (const section of course.sections) {
          const conflicts = section.dayKeys.some((day) =>
            occupied.some(
              (o) =>
                o.day === day &&
                o.courseId !== course.id &&
                section.startHour < o.end &&
                section.endHour > o.start
            )
          );
          if (!conflicts) {
            for (const day of section.dayKeys) {
              blocks.push({ course, section, day, tier, conflict: false });
              occupied.push({ day, start: section.startHour, end: section.endHour, courseId: course.id });
            }
            placed = true;
            break;
          }
        }
        // If no non-conflicting section, place with conflict flag using first section
        if (!placed && course.sections.length > 0) {
          const section = course.sections[0];
          for (const day of section.dayKeys) {
            blocks.push({ course, section, day, tier, conflict: true });
          }
        }
      }
    };

    processGroup(needToHave, 'need');
    processGroup(niceToHave, 'nice');
    return blocks;
  }, [needToHave, niceToHave]);

  const hasNeedConflict = placedBlocks.some((b) => b.conflict && b.tier === 'need');

  // Auto-calculate bid points
  useEffect(() => {
    if (needToHave.length === 0 && niceToHave.length === 0) return;
    const total = 1000;
    const needWeight = 0.75;
    const niceWeight = 0.25;
    const newBp: Record<string, number> = {};

    const needCount = needToHave.length;
    const niceCount = niceToHave.length;

    if (needCount > 0) {
      const perNeed = Math.floor((total * needWeight) / needCount);
      needToHave.forEach((c, i) => {
        newBp[c.id] = i === 0 ? perNeed + (total * needWeight % needCount) : perNeed;
      });
    }
    if (niceCount > 0) {
      const perNice = Math.floor((total * niceWeight) / niceCount);
      niceToHave.forEach((c, i) => {
        newBp[c.id] = i === 0 ? perNice + (total * niceWeight % niceCount) : perNice;
      });
    }
    setBidPoints(newBp);
  }, [needToHave, niceToHave]);

  const usedPoints = Object.values(bidPoints).reduce((s, v) => s + v, 0);

  const handleBidChange = (id: string, val: number) => {
    setBidPoints({ ...bidPoints, [id]: val });
  };

  if (needToHave.length === 0 && niceToHave.length === 0) {
    return (
      <div className="screen schedule-screen">
        <div className="empty-state">
          <div className="empty-icon">▦</div>
          <p>No courses prioritized yet.</p>
          <button onClick={() => setScreen('prioritize')}>Go to Prioritize →</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen schedule-screen">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Schedule Optimizer</h1>
          <p className="screen-subtitle">Your optimized course schedule for the semester.</p>
        </div>
      </div>

      {hasNeedConflict && (
        <div className="conflict-banner">
          ⚠ Your top priorities conflict — consider adjusting in the{' '}
          <button onClick={() => setScreen('prioritize')}>Prioritize</button> tab.
        </div>
      )}

      <div className="schedule-layout">
        {/* Calendar Grid */}
        <div className="calendar-wrap">
          <div className="calendar-grid">
            {/* Time column */}
            <div className="time-col">
              <div className="day-header-spacer" />
              {Array.from({ length: TOTAL_HOURS + 1 }).map((_, i) => {
                const h = START_HOUR + i;
                return (
                  <div key={h} className="time-label" style={{ top: `${(i / TOTAL_HOURS) * 100}%` }}>
                    {formatHour(h)}
                  </div>
                );
              })}
            </div>

            {/* Day columns */}
            {DAYS.map((day) => {
              const dayBlocks = placedBlocks.filter((b) => b.day === day);
              const oblBlock = STUDENT.obligatoryBlocks.find((ob) => ob.day === day);

              return (
                <div key={day} className="day-col">
                  <div className="day-header">{day}</div>
                  <div className="day-body">
                    {/* Hour grid lines */}
                    {Array.from({ length: TOTAL_HOURS }).map((_, i) => (
                      <div
                        key={i}
                        className="hour-line"
                        style={{ top: `${(i / TOTAL_HOURS) * 100}%` }}
                      />
                    ))}

                    {/* Obligatory block */}
                    {oblBlock && (
                      <div
                        className="cal-block cal-block-obligatory"
                        style={{
                          top: `${hourToPercent(oblBlock.startHour)}%`,
                          height: `${durationToPercent(oblBlock.startHour, oblBlock.endHour)}%`,
                        }}
                        title={oblBlock.label}
                      >
                        <span className="block-label">{oblBlock.label}</span>
                      </div>
                    )}

                    {/* Course blocks */}
                    {dayBlocks.map((block, idx) => {
                      const cls = block.conflict
                        ? 'cal-block-conflict'
                        : block.tier === 'need'
                        ? 'cal-block-need'
                        : 'cal-block-nice';
                      return (
                        <div
                          key={`${block.course.id}-${idx}`}
                          className={`cal-block ${cls}`}
                          style={{
                            top: `${hourToPercent(block.section.startHour)}%`,
                            height: `${durationToPercent(block.section.startHour, block.section.endHour)}%`,
                          }}
                          title={
                            block.conflict
                              ? `⚠ ${block.course.title} conflicts with another course`
                              : block.course.title
                          }
                        >
                          <span className="block-number">{block.course.number}</span>
                          <span className="block-title">{block.course.title}</span>
                          {block.conflict && <span className="block-conflict-icon">⚠</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="cal-legend">
            <span className="legend-item"><span className="legend-dot dot-need" />Need-to-Have</span>
            <span className="legend-item"><span className="legend-dot dot-nice" />Nice-to-Have</span>
            <span className="legend-item"><span className="legend-dot dot-obligatory" />Obligatory</span>
            <span className="legend-item"><span className="legend-dot dot-conflict" />Conflict</span>
          </div>
        </div>

        {/* Bid Points Sidebar */}
        <div className="bid-sidebar">
          <div className="bid-header">
            <h2 className="bid-title">Bid Allocation</h2>
            <div className={`bid-total ${usedPoints > 1000 ? 'over' : 'ok'}`}>
              {usedPoints} / 1,000 pts
            </div>
          </div>

          {usedPoints > 1000 && (
            <div className="bid-warning">Over budget by {usedPoints - 1000} pts</div>
          )}

          <div className="bid-progress">
            <div
              className="bid-bar"
              style={{ width: `${Math.min(100, (usedPoints / 1000) * 100)}%` }}
            />
          </div>

          {needToHave.length > 0 && (
            <div className="bid-section">
              <div className="bid-section-label need">Need-to-Have</div>
              {needToHave.map((c) => (
                <BidRow
                  key={c.id}
                  course={c}
                  value={bidPoints[c.id] || 0}
                  onChange={(v) => handleBidChange(c.id, v)}
                  tier="need"
                />
              ))}
            </div>
          )}

          {niceToHave.length > 0 && (
            <div className="bid-section">
              <div className="bid-section-label nice">Nice-to-Have</div>
              {niceToHave.map((c) => (
                <BidRow
                  key={c.id}
                  course={c}
                  value={bidPoints[c.id] || 0}
                  onChange={(v) => handleBidChange(c.id, v)}
                  tier="nice"
                />
              ))}
            </div>
          )}

          <div className="bid-hint">
            Adjust allocations above. Total must equal 1,000 points.
          </div>
        </div>
      </div>
    </div>
  );
}

function BidRow({
  course,
  value,
  onChange,
  tier,
}: {
  course: Course;
  value: number;
  onChange: (v: number) => void;
  tier: 'need' | 'nice';
}) {
  return (
    <div className={`bid-row bid-row-${tier}`}>
      <div className="bid-row-info">
        <span className="bid-row-number">{course.number}</span>
        <span className="bid-row-title">{course.title}</span>
      </div>
      <div className="bid-row-input-wrap">
        <input
          type="number"
          className="bid-input"
          value={value}
          min={0}
          max={1000}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="bid-pts-label">pts</span>
      </div>
    </div>
  );
}
