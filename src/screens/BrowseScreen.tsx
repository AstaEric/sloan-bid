import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import type { Course, Section, Term } from '../types';
import { ALL_COURSES, STUDENT } from '../data/courses';
import { computeSchedule, termsConflict } from '../utils/scheduleEngine';
import { StarRating } from '../components/StarRating';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const START_HOUR = 8.5;
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

type Slot = { day: string; start: number; end: number; term: string | null };

function slotsConflict(a: Slot, b: Slot) {
  if (a.day !== b.day) return false;
  if (a.start >= b.end || a.end <= b.start) return false;
  if ((a.term === 'H3' && b.term === 'H4') || (a.term === 'H4' && b.term === 'H3')) return false;
  return true;
}

function sectionFits(section: Section, courseTerm: string, occupied: Slot[]): boolean {
  for (const day of section.dayKeys) {
    for (const o of occupied) {
      if (o.day !== day) continue;
      if (section.startHour >= o.end || section.endHour <= o.start) continue;
      if (!termsConflict(courseTerm as 'Full' | 'H3' | 'H4', o.term as 'Full' | 'H3' | 'H4' | null)) continue;
      return false;
    }
  }
  return true;
}

export function BrowseScreen() {
  const {
    needToHave,
    niceToHave,
    optional,
    setNeedToHave,
    setNiceToHave,
    setOptional,
    sectionOverrides,
    addedCourses,
    addCourse,
    setScreen,
    hiddenCourseIds,
  } = useApp();

  const [search, setSearch] = useState('');
  const [filterDay, setFilterDay] = useState<string>('');
  const [filterMinRating, setFilterMinRating] = useState<number>(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tierPickerCourseId, setTierPickerCourseId] = useState<string | null>(null);

  // ── Replicate ScheduleScreen's blockedNiceIds logic ──

  const obligatorySlots: Slot[] = STUDENT.obligatoryBlocks.map((ob) => ({
    day: ob.day, start: ob.startHour, end: ob.endHour, term: null,
  }));

  // Step 1: Visible needs (only manual hides)
  const visibleNeed = needToHave.filter((c) => !hiddenCourseIds.has(c.id));

  // Step 2: Need-only schedule to get base slots
  const needOnlyBlocks = useMemo(
    () => computeSchedule({ needToHave: visibleNeed, niceToHave: [], optional: [], sectionOverrides }),
    [visibleNeed, sectionOverrides]
  );

  const needBaseSlots = useMemo(() => {
    const slots: Slot[] = [...obligatorySlots];
    for (const b of needOnlyBlocks) {
      if (b.tier === 'need' && !b.conflict) {
        slots.push({ day: b.day, start: b.section.startHour, end: b.section.endHour, term: b.course.term });
      }
    }
    return slots;
  }, [needOnlyBlocks]);

  // Step 3: Identify blocked Nice-to-Haves (no section fits against needs)
  const blockedNiceIds = useMemo(() => {
    const blocked = new Set<string>();
    for (const c of niceToHave) {
      const canFit = c.sections.some((sec) => {
        const slots: Slot[] = sec.dayKeys.map((d) => ({ day: d, start: sec.startHour, end: sec.endHour, term: c.term as Term }));
        return !slots.some((s) => needBaseSlots.some((o) => slotsConflict(s, o)));
      });
      if (!canFit) blocked.add(c.id);
    }
    return blocked;
  }, [niceToHave, needBaseSlots]);

  // Step 4: Visible nices = not manually hidden AND not blocked
  const visibleNice = niceToHave.filter((c) => {
    if (hiddenCourseIds.has(c.id)) return false;
    if (blockedNiceIds.has(c.id)) return false;
    return true;
  });

  // Step 5: Full schedule with all visible courses
  const placedBlocks = useMemo(
    () => computeSchedule({ needToHave: visibleNeed, niceToHave: visibleNice, optional, sectionOverrides }),
    [visibleNeed, visibleNice, optional, sectionOverrides]
  );

  // Build occupied slots from placed blocks + obligatory
  const occupiedSlots: Slot[] = useMemo(() => {
    const slots: Slot[] = STUDENT.obligatoryBlocks.map((ob) => ({
      day: ob.day, start: ob.startHour, end: ob.endHour, term: null,
    }));
    for (const b of placedBlocks) {
      if (!b.couldntFit) {
        slots.push({ day: b.day, start: b.section.startHour, end: b.section.endHour, term: b.course.term });
      }
    }
    return slots;
  }, [placedBlocks]);

  // IDs of all courses already added
  const addedIds = useMemo(() => new Set(addedCourses.map((c) => c.id)), [addedCourses]);

  // Find courses that fit and aren't already added
  const fittingCourses = useMemo(() => {
    return ALL_COURSES.filter((c) => {
      if (addedIds.has(c.id)) return false;
      if (c.isCompleted) return false;
      // At least one section must fit
      return c.sections.some((s) => sectionFits(s, c.term, occupiedSlots));
    });
  }, [addedIds, occupiedSlots]);

  // Apply search/day/rating filters
  const filtered = useMemo(() => {
    return fittingCourses.filter((c) => {
      if (search && !c.title.toLowerCase().includes(search.toLowerCase()) &&
          !c.number.toLowerCase().includes(search.toLowerCase()) &&
          !c.professor.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterDay && !c.sections.some((s) => s.dayKeys.includes(filterDay))) return false;
      if (filterMinRating && c.rating < filterMinRating) return false;
      return true;
    });
  }, [fittingCourses, search, filterDay, filterMinRating]);

  const handleAddToTier = (e: React.MouseEvent, course: Course, tier: 'need' | 'nice' | 'optional') => {
    e.stopPropagation();
    addCourse(course);
    if (tier === 'need') {
      setNeedToHave([...needToHave, course]);
    } else if (tier === 'nice') {
      setNiceToHave([...niceToHave, course]);
    } else {
      setOptional([...optional, course]);
    }
    setTierPickerCourseId(null);
  };

  const handlePlusClick = (e: React.MouseEvent, courseId: string) => {
    e.stopPropagation();
    setTierPickerCourseId(tierPickerCourseId === courseId ? null : courseId);
  };

  const handleCardClick = (id: string) => {
    setExpanded(expanded === id ? null : id);
  };

  return (
    <div className="screen browse-screen">
      {/* Static Calendar */}
      <div className="browse-calendar">
        <button className="browse-back-link" onClick={() => setScreen('schedule')}>
          ← Back to Schedule
        </button>

        <div className="calendar-grid">
          {/* Time column */}
          <div className="time-col">
            <div className="day-header-spacer" />
            {Array.from({ length: Math.floor(END_HOUR) - Math.ceil(START_HOUR) + 1 }).map((_, i) => {
              const h = Math.ceil(START_HOUR) + i;
              return (
                <div key={h} className="time-label" style={{ top: `${hourToPercent(h)}%` }}>
                  {formatHour(h)}
                </div>
              );
            })}
          </div>

          {/* Day columns */}
          {DAYS.map((day) => {
            const dayBlocks = placedBlocks.filter((b) => b.day === day && !b.couldntFit);
            const oblBlock = STUDENT.obligatoryBlocks.find((ob) => ob.day === day);

            return (
              <div key={day} className="day-col">
                <div className="day-header">{day}</div>
                <div className="day-body">
                  {/* Hour grid lines */}
                  {Array.from({ length: Math.floor(END_HOUR) - Math.ceil(START_HOUR) + 1 }).map((_, i) => {
                    const h = Math.ceil(START_HOUR) + i;
                    return (
                      <div
                        key={h}
                        className="hour-line"
                        style={{ top: `${hourToPercent(h)}%` }}
                      />
                    );
                  })}

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
                      : block.tier === 'nice'
                      ? 'cal-block-nice'
                      : 'cal-block-optional';

                    return (
                      <div
                        key={`${block.course.id}-${idx}`}
                        className={`cal-block ${cls}`}
                        style={{
                          top: `${hourToPercent(block.section.startHour)}%`,
                          height: `${durationToPercent(block.section.startHour, block.section.endHour)}%`,
                        }}
                        title={block.course.title}
                      >
                        <span className="block-number">{block.course.number}</span>
                        <span className="block-title">{block.course.title}</span>
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
          <span className="legend-item"><span className="legend-dot dot-optional" />Optional</span>
          <span className="legend-item"><span className="legend-dot dot-obligatory" />Obligatory</span>
        </div>
      </div>

      {/* Browse Courses Panel */}
      <div className="browse-courses">
        <h2 className="browse-heading">Browse compatible</h2>
        <p className="browse-subtitle">{filtered.length} course{filtered.length !== 1 ? 's' : ''} available</p>

        {/* Filter Bar */}
        <div className="browse-filter-bar">
          <div className="search-input-wrap">
            <span className="search-icon">⌕</span>
            <input
              className="search-input"
              type="text"
              placeholder="Search courses..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="search-clear" onClick={() => setSearch('')}>✕</button>
            )}
          </div>

          <div className="filter-group">
            <div className="filter-chips">
              {DAYS.map((d) => (
                <button
                  key={d}
                  className={`chip ${filterDay === d ? 'active' : ''}`}
                  onClick={() => setFilterDay(filterDay === d ? '' : d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <div className="filter-chips">
              {[4.0, 4.5].map((r) => (
                <button
                  key={r}
                  className={`chip ${filterMinRating === r ? 'active' : ''}`}
                  onClick={() => setFilterMinRating(filterMinRating === r ? 0 : r)}
                >
                  ★ {r}+
                </button>
              ))}
            </div>
          </div>

          {(filterDay || filterMinRating > 0) && (
            <button className="filter-clear-all" onClick={() => { setFilterDay(''); setFilterMinRating(0); }}>
              Clear filters
            </button>
          )}
        </div>

        {/* Course List */}
        <div className="browse-course-grid">
          {filtered.map((course) => (
            <div
              key={course.id}
              className={`course-card ${expanded === course.id ? 'expanded' : ''}`}
              onClick={() => handleCardClick(course.id)}
            >
              <div className="course-card-header">
                <div className="course-number">
                  {course.number}
                  <span className={`term-badge term-${course.term.toLowerCase()}`}>{course.term} · {course.units}u</span>
                </div>
                <div className="tier-picker-wrap">
                  <button
                    className="add-btn"
                    onClick={(e) => handlePlusClick(e, course.id)}
                    title="Add to schedule"
                  >
                    +
                  </button>
                  {tierPickerCourseId === course.id && (
                    <div className="tier-picker" onClick={(e) => e.stopPropagation()}>
                      <button className="tier-picker-btn tier-picker-need" onClick={(e) => handleAddToTier(e, course, 'need')}>
                        Need-to-Have
                      </button>
                      <button className="tier-picker-btn tier-picker-nice" onClick={(e) => handleAddToTier(e, course, 'nice')}>
                        Nice-to-Have
                      </button>
                      <button className="tier-picker-btn tier-picker-optional" onClick={(e) => handleAddToTier(e, course, 'optional')}>
                        Optional
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <h3 className="course-title">{course.title}</h3>
              <p className="course-professor">{course.professor}</p>

              <StarRating rating={course.rating} size="sm" />

              <p className="course-quote">"{course.reviewQuote}"</p>

              <div className="course-sections-preview">
                {course.sections.map((s) => {
                  const fits = sectionFits(s, course.term, occupiedSlots);
                  return (
                    <span key={s.id} className={`section-tag ${fits ? 'browse-section-fit' : 'browse-section-nofit'}`}>
                      {s.days} · {s.time} {fits ? '✓' : ''}
                    </span>
                  );
                })}
              </div>

              {/* Expanded Detail */}
              {expanded === course.id && (
                <div className="course-expanded" onClick={(e) => e.stopPropagation()}>
                  <div className="expanded-divider" />
                  <div className="expanded-syllabus">
                    <div className="syllabus-icon">&#x1F4D8;</div>
                    <h4 className="expanded-label">Course Overview</h4>
                    <p className="course-description">{course.description}</p>
                  </div>
                  <div className="expanded-sections">
                    <h4 className="expanded-label">Available Sections</h4>
                    {course.sections.map((s) => {
                      const fits = sectionFits(s, course.term, occupiedSlots);
                      return (
                        <div key={s.id} className={`expanded-section-row ${fits ? '' : 'browse-section-nofit'}`}>
                          <span className="section-days">{s.days}</span>
                          <span className="section-time">{s.time}</span>
                          {fits && <span className="browse-fit-badge">Fits</span>}
                        </div>
                      );
                    })}
                  </div>
                  <div className="tier-picker-expanded">
                    <span className="tier-picker-label">Add to:</span>
                    <button className="tier-picker-btn tier-picker-need" onClick={(e) => handleAddToTier(e, course, 'need')}>
                      Need-to-Have
                    </button>
                    <button className="tier-picker-btn tier-picker-nice" onClick={(e) => handleAddToTier(e, course, 'nice')}>
                      Nice-to-Have
                    </button>
                    <button className="tier-picker-btn tier-picker-optional" onClick={(e) => handleAddToTier(e, course, 'optional')}>
                      Optional
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">◎</div>
              <p>No fitting courses match your filters.</p>
              {(search || filterDay || filterMinRating > 0) && (
                <button onClick={() => { setSearch(''); setFilterDay(''); setFilterMinRating(0); }}>
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
