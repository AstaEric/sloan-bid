import type { Course, Section, Term } from '../types';
import { STUDENT } from '../data/courses';

export interface PlacedBlock {
  course: Course;
  section: Section;
  day: string;
  tier: 'need' | 'nice' | 'optional';
  conflict: boolean;
  couldntFit?: boolean;
}

export interface ScheduleInput {
  needToHave: Course[];
  niceToHave: Course[];
  optional: Course[];
  sectionOverrides: Record<string, string>;
}

type Slot = { day: string; start: number; end: number; courseId: string; term: Term | null };

/**
 * H3 and H4 courses never conflict with each other (different halves of semester).
 * All other overlapping combinations are conflicts.
 */
export function termsConflict(a: Term | null, b: Term | null): boolean {
  if ((a === 'H3' && b === 'H4') || (a === 'H4' && b === 'H3')) return false;
  return true;
}

function slotConflicts(section: Section, courseId: string, courseTerm: Term, occupied: Slot[]): boolean {
  return section.dayKeys.some((day) =>
    occupied.some(
      (o) =>
        o.day === day &&
        o.courseId !== courseId &&
        section.startHour < o.end &&
        section.endHour > o.start &&
        termsConflict(courseTerm, o.term)
    )
  );
}

/**
 * Try all section combinations for a group of courses and return the
 * assignment (courseId → Section) that minimizes total conflicts.
 * Section overrides lock a course to a single candidate.
 */
function findBestSections(
  courses: Course[],
  overrides: Record<string, string>,
  baseOccupied: Slot[]
): Map<string, Section> {
  if (courses.length === 0) return new Map();

  const options = courses.map((c) => {
    const oid = overrides[c.id];
    if (oid) {
      const s = c.sections.find((x) => x.id === oid);
      return { course: c, candidates: s ? [s] : c.sections };
    }
    return { course: c, candidates: c.sections };
  });

  let bestMap = new Map<string, Section>();
  let bestConflicts = Infinity;

  function solve(
    idx: number,
    occupied: Slot[],
    conflicts: number,
    chosen: Map<string, Section>
  ) {
    if (conflicts >= bestConflicts) return; // prune

    if (idx === options.length) {
      bestConflicts = conflicts;
      bestMap = new Map(chosen);
      return;
    }

    const { course, candidates } = options[idx];

    for (const section of candidates) {
      const clash = slotConflicts(section, course.id, course.term, occupied);
      chosen.set(course.id, section);

      if (clash) {
        // Conflicting courses don't occupy slots (consistent with placement)
        solve(idx + 1, occupied, conflicts + 1, chosen);
      } else {
        const next = [...occupied];
        for (const day of section.dayKeys) {
          next.push({ day, start: section.startHour, end: section.endHour, courseId: course.id, term: course.term });
        }
        solve(idx + 1, next, conflicts, chosen);
      }

      chosen.delete(course.id);
      if (bestConflicts === 0) return; // perfect — stop early
    }
  }

  solve(0, [...baseOccupied], 0, new Map());
  return bestMap;
}

export function computeSchedule(input: ScheduleInput): PlacedBlock[] {
  const { needToHave, niceToHave, optional, sectionOverrides } = input;
  const blocks: PlacedBlock[] = [];

  // Obligatory blocks — always locked (term null = conflicts with everything)
  const obligatory: Slot[] = STUDENT.obligatoryBlocks.map((ob) => ({
    day: ob.day, start: ob.startHour, end: ob.endHour, courseId: 'obligatory', term: null,
  }));

  // ── Step 1: Optimize section choices for Need-to-Haves ──
  const needSections = findBestSections(needToHave, sectionOverrides, obligatory);

  const occupied: Slot[] = [...obligatory];

  for (const course of needToHave) {
    const section = needSections.get(course.id) ?? course.sections[0];
    if (!section) continue;

    const clash = slotConflicts(section, course.id, course.term, occupied);
    for (const day of section.dayKeys) {
      blocks.push({ course, section, day, tier: 'need', conflict: clash });
    }
    if (!clash) {
      for (const day of section.dayKeys) {
        occupied.push({ day, start: section.startHour, end: section.endHour, courseId: course.id, term: course.term });
      }
    }
  }

  // Post-process: if a need block conflicts, mark overlapping non-conflicting need blocks too
  const conflictingNeedBlocks = blocks.filter((b) => b.tier === 'need' && b.conflict);
  for (const cb of conflictingNeedBlocks) {
    for (const b of blocks) {
      if (b.tier === 'need' && !b.conflict && b.day === cb.day &&
          b.section.startHour < cb.section.endHour &&
          b.section.endHour > cb.section.startHour &&
          b.course.id !== cb.course.id &&
          termsConflict(b.course.term, cb.course.term)) {
        b.conflict = true;
      }
    }
  }

  // ── Step 2: Optimize section choices for Nice-to-Haves ──
  const niceSections = findBestSections(niceToHave, sectionOverrides, occupied);

  for (const course of niceToHave) {
    const section = niceSections.get(course.id) ?? course.sections[0];
    if (!section) continue;

    const clash = slotConflicts(section, course.id, course.term, occupied);
    if (clash) {
      for (const day of section.dayKeys) {
        blocks.push({ course, section, day, tier: 'nice', conflict: true, couldntFit: true });
      }
    } else {
      for (const day of section.dayKeys) {
        blocks.push({ course, section, day, tier: 'nice', conflict: false });
        occupied.push({ day, start: section.startHour, end: section.endHour, courseId: course.id, term: course.term });
      }
    }
  }

  // ── Step 3: Optimize section choices for Optional ──
  const optSections = findBestSections(optional, sectionOverrides, occupied);

  for (const course of optional) {
    const section = optSections.get(course.id) ?? course.sections[0];
    if (!section) continue;

    const clash = slotConflicts(section, course.id, course.term, occupied);
    if (clash) {
      for (const day of section.dayKeys) {
        blocks.push({ course, section, day, tier: 'optional', conflict: true, couldntFit: true });
      }
    } else {
      for (const day of section.dayKeys) {
        blocks.push({ course, section, day, tier: 'optional', conflict: false });
        occupied.push({ day, start: section.startHour, end: section.endHour, courseId: course.id, term: course.term });
      }
    }
  }

  return blocks;
}

/** Get the section currently assigned to a course in a computed schedule */
export function getAssignedSection(blocks: PlacedBlock[], courseId: string): Section | null {
  const block = blocks.find((b) => b.course.id === courseId);
  return block ? block.section : null;
}

/** Get courses that couldn't fit */
export function getCouldntFit(blocks: PlacedBlock[]): Course[] {
  const seen = new Set<string>();
  const result: Course[] = [];
  for (const b of blocks) {
    if (b.couldntFit && !seen.has(b.course.id)) {
      seen.add(b.course.id);
      result.push(b.course);
    }
  }
  return result;
}
