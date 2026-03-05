import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import type { Course } from '../types';
import { STUDENT } from '../data/courses';
import { computeSchedule, getAssignedSection } from '../utils/scheduleEngine';

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

export function ScheduleScreen() {
  const { needToHave, niceToHave, setScreen, sectionOverrides, setSectionOverride } = useApp();

  const placedBlocks = useMemo(
    () => computeSchedule({ needToHave, niceToHave, sectionOverrides }),
    [needToHave, niceToHave, sectionOverrides]
  );

  const hasNeedConflict = placedBlocks.some((b) => b.conflict && b.tier === 'need');

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

        {/* Section Toggle Sidebar */}
        <div className="bid-sidebar">
          <div className="bid-header">
            <h2 className="bid-title">Sections</h2>
          </div>

          {needToHave.length > 0 && (
            <div className="bid-section">
              <div className="bid-section-label need">Need-to-Have</div>
              {needToHave.map((c) => (
                <SectionToggle
                  key={c.id}
                  course={c}
                  currentSectionId={getAssignedSection(placedBlocks, c.id)?.id || null}
                  onSwitch={(sectionId) => setSectionOverride(c.id, sectionId)}
                  tier="need"
                  placedBlocks={placedBlocks}
                />
              ))}
            </div>
          )}

          {niceToHave.length > 0 && (
            <div className="bid-section">
              <div className="bid-section-label nice">Nice-to-Have</div>
              {niceToHave.map((c) => (
                <SectionToggle
                  key={c.id}
                  course={c}
                  currentSectionId={getAssignedSection(placedBlocks, c.id)?.id || null}
                  onSwitch={(sectionId) => setSectionOverride(c.id, sectionId)}
                  tier="nice"
                  placedBlocks={placedBlocks}
                />
              ))}
            </div>
          )}

          <div className="bid-hint">
            Select a section for each course. The calendar updates automatically.
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionToggle({
  course,
  currentSectionId,
  onSwitch,
  tier,
  placedBlocks,
}: {
  course: Course;
  currentSectionId: string | null;
  onSwitch: (sectionId: string) => void;
  tier: 'need' | 'nice';
  placedBlocks: ReturnType<typeof computeSchedule>;
}) {
  const isConflicting = placedBlocks.some((b) => b.course.id === course.id && b.conflict);

  return (
    <div className={`bid-row bid-row-${tier} ${isConflicting ? 'bid-row-conflict' : ''}`}>
      <div className="bid-row-info">
        <span className="bid-row-number">{course.number}</span>
        <span className="bid-row-title">{course.title}</span>
      </div>
      {course.sections.length > 1 ? (
        <div className="section-toggle-group">
          {course.sections.map((s) => (
            <button
              key={s.id}
              className={`section-toggle-btn ${s.id === currentSectionId ? 'active' : ''}`}
              onClick={() => onSwitch(s.id)}
              title={`${s.days} ${s.time}`}
            >
              {s.days}
            </button>
          ))}
        </div>
      ) : (
        <span className="section-single">{course.sections[0]?.days}</span>
      )}
    </div>
  );
}
