import React, { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCenter,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useApp } from '../context/AppContext';
import type { Course } from '../types';
import { StarRating } from '../components/StarRating';

// Droppable column
function DroppableColumn({
  id,
  title,
  courses,
  color,
  emptyLabel,
  activeId,
}: {
  id: string;
  title: string;
  courses: Course[];
  color: string;
  emptyLabel: string;
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`droppable-column ${isOver ? 'over' : ''} col-${color}`}
    >
      <div className="column-header">
        <div className={`column-dot dot-${color}`} />
        <h2 className="column-title">{title}</h2>
        <span className="column-count">{courses.length}</span>
      </div>
      <SortableContext items={courses.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="column-body">
          {courses.length === 0 && (
            <div className="column-empty">
              <span>{emptyLabel}</span>
            </div>
          )}
          {courses.map((course) => (
            <SortableCard key={course.id} course={course} isDragging={activeId === course.id} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

// Draggable unassigned card
function SortableCard({ course, isDragging }: { course: Course; isDragging: boolean }) {
  const { setNodeRef, attributes, listeners, transform, transition } = useSortable({
    id: course.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <MiniCourseCard course={course} />
    </div>
  );
}

function MiniCourseCard({ course, overlay }: { course: Course; overlay?: boolean }) {
  return (
    <div className={`mini-card ${overlay ? 'overlay' : ''}`}>
      <div className="mini-card-top">
        <span className="mini-card-number">{course.number}</span>
        <span className="mini-card-grip">⋮⋮</span>
      </div>
      <div className="mini-card-title">{course.title}</div>
      <div className="mini-card-prof">{course.professor}</div>
      <StarRating rating={course.rating} size="sm" />
    </div>
  );
}

// Unassigned pool — courses added but not yet in either column
function UnassignedPool({
  courses,
  activeId,
}: {
  courses: Course[];
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unassigned' });
  return (
    <div className="unassigned-section">
      <h3 className="unassigned-title">Added Courses — drag to categorize</h3>
      <SortableContext items={courses.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`unassigned-pool ${isOver ? 'over' : ''} ${courses.length === 0 ? 'pool-empty' : ''}`}
        >
          {courses.length === 0 && (
            <span className="pool-empty-label">
              All courses categorized ✓
            </span>
          )}
          {courses.map((c) => (
            <SortableCard key={c.id} course={c} isDragging={activeId === c.id} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

export function PrioritizeScreen() {
  const {
    addedCourses,
    needToHave,
    niceToHave,
    setNeedToHave,
    setNiceToHave,
    setScreen,
  } = useApp();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Courses in the unassigned pool: added but not in need/nice
  const assignedIds = new Set([...needToHave.map((c) => c.id), ...niceToHave.map((c) => c.id)]);
  const unassigned = addedCourses.filter((c) => !assignedIds.has(c.id));

  const findContainer = (id: string): 'need' | 'nice' | 'unassigned' | null => {
    if (needToHave.find((c) => c.id === id)) return 'need';
    if (niceToHave.find((c) => c.id === id)) return 'nice';
    if (unassigned.find((c) => c.id === id)) return 'unassigned';
    return null;
  };

  const getList = (container: string): Course[] => {
    if (container === 'need') return needToHave;
    if (container === 'nice') return niceToHave;
    return unassigned;
  };

  const setList = (container: string, courses: Course[]) => {
    if (container === 'need') setNeedToHave(courses);
    else if (container === 'nice') setNiceToHave(courses);
    // unassigned is derived
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;

    const activeContainer = findContainer(String(active.id));
    if (!activeContainer) return;

    let overContainer: 'need' | 'nice' | 'unassigned';
    // Check if dropped directly on a container
    if (over.id === 'need' || over.id === 'nice' || over.id === 'unassigned') {
      overContainer = over.id as 'need' | 'nice' | 'unassigned';
    } else {
      overContainer = findContainer(String(over.id)) || activeContainer;
    }

    const activeList = getList(activeContainer);
    const overList = getList(overContainer);
    const activeIdx = activeList.findIndex((c) => c.id === String(active.id));
    const overIdx = overList.findIndex((c) => c.id === String(over.id));

    if (activeContainer === overContainer) {
      // Reorder within same list
      if (activeContainer !== 'unassigned') {
        const newList = arrayMove(activeList, activeIdx, overIdx >= 0 ? overIdx : activeList.length - 1);
        setList(activeContainer, newList);
      }
    } else {
      // Move between lists
      const item = activeList[activeIdx];
      if (!item) return;

      const newActiveList = activeList.filter((_, i) => i !== activeIdx);
      const insertAt = overIdx >= 0 ? overIdx : overList.length;
      const newOverList = [...overList.slice(0, insertAt), item, ...overList.slice(insertAt)];

      // Update source
      if (activeContainer === 'need') setNeedToHave(newActiveList);
      else if (activeContainer === 'nice') setNiceToHave(newActiveList);
      // If from unassigned, nothing to set (it's derived)

      // Update destination
      if (overContainer === 'need') setNeedToHave(newOverList);
      else if (overContainer === 'nice') setNiceToHave(newOverList);
      // If dropping back to unassigned, remove from need/nice (source already handled)
    }
  };

  const activeCourse = activeId
    ? [...needToHave, ...niceToHave, ...unassigned].find((c) => c.id === activeId)
    : null;

  return (
    <div className="screen prioritize-screen">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Prioritize</h1>
          <p className="screen-subtitle">
            Drag courses into your tiers to set priorities.
          </p>
        </div>
        {(needToHave.length > 0 || niceToHave.length > 0) && (
          <button className="cta-btn" onClick={() => setScreen('schedule')}>
            Build Schedule →
          </button>
        )}
      </div>

      {addedCourses.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">⊟</div>
          <p>You haven't added any courses yet.</p>
          <button onClick={() => setScreen('discover')}>Browse courses →</button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="prioritize-layout">
            {/* Unassigned Pool */}
            <UnassignedPool courses={unassigned} activeId={activeId} />

            {/* Two-column tiers */}
            <div className="tier-columns">
              <DroppableColumn
                id="need"
                title="Need-to-Have"
                courses={needToHave}
                color="need"
                emptyLabel="Drop courses here — highest priority"
                activeId={activeId}
              />
              <DroppableColumn
                id="nice"
                title="Nice-to-Have"
                courses={niceToHave}
                color="nice"
                emptyLabel="Drop courses here — lower priority"
                activeId={activeId}
              />
            </div>
          </div>

          <DragOverlay>
            {activeCourse && (
              <MiniCourseCard course={activeCourse} overlay />
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* Course Info Panel */}
      {selectedCourse && (
        <div className="course-info-panel">
          <div className="panel-header">
            <div>
              <span className="panel-number">{selectedCourse.number}</span>
              <h3 className="panel-title">{selectedCourse.title}</h3>
            </div>
            <button className="panel-close" onClick={() => setSelectedCourse(null)}>✕</button>
          </div>
          <p className="panel-prof">{selectedCourse.professor}</p>
          <StarRating rating={selectedCourse.rating} />
          <p className="panel-quote">"{selectedCourse.reviewQuote}"</p>
          <div className="panel-sections">
            <h4>Sections</h4>
            {selectedCourse.sections.map((s) => (
              <div key={s.id} className="panel-section-row">
                <span>{s.days}</span>
                <span>{s.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
