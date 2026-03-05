import type { Course, Section } from '../types';
import { STUDENT } from '../data/courses';

export interface PlacedBlock {
  course: Course;
  section: Section;
  day: string;
  tier: 'need' | 'nice';
  conflict: boolean;
}

export interface ScheduleInput {
  needToHave: Course[];
  niceToHave: Course[];
  sectionOverrides: Record<string, string>;
}

export function computeSchedule(input: ScheduleInput): PlacedBlock[] {
  const { needToHave, niceToHave, sectionOverrides } = input;
  const blocks: PlacedBlock[] = [];
  const occupied: { day: string; start: number; end: number; courseId: string }[] = [];

  // Obligatory blocks
  for (const ob of STUDENT.obligatoryBlocks) {
    occupied.push({ day: ob.day, start: ob.startHour, end: ob.endHour, courseId: 'obligatory' });
  }

  const checkConflicts = (section: Section, courseId: string) =>
    section.dayKeys.some((day) =>
      occupied.some(
        (o) =>
          o.day === day &&
          o.courseId !== courseId &&
          section.startHour < o.end &&
          section.endHour > o.start
      )
    );

  const processGroup = (courses: Course[], tier: 'need' | 'nice') => {
    for (const course of courses) {
      let placed = false;

      // If there's a section override, always use it
      const overrideId = sectionOverrides[course.id];
      if (overrideId) {
        const section = course.sections.find((s) => s.id === overrideId);
        if (section) {
          const hasConflict = checkConflicts(section, course.id);
          for (const day of section.dayKeys) {
            blocks.push({ course, section, day, tier, conflict: hasConflict });
          }
          if (!hasConflict) {
            for (const day of section.dayKeys) {
              occupied.push({ day, start: section.startHour, end: section.endHour, courseId: course.id });
            }
          }
          placed = true;
        }
      }

      // Auto-assign: try sections in order, pick first non-conflicting
      if (!placed) {
        for (const section of course.sections) {
          if (!checkConflicts(section, course.id)) {
            for (const day of section.dayKeys) {
              blocks.push({ course, section, day, tier, conflict: false });
              occupied.push({ day, start: section.startHour, end: section.endHour, courseId: course.id });
            }
            placed = true;
            break;
          }
        }
      }

      // Fallback: place with conflict flag using first section
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
}

/** Get the section currently assigned to a course in a computed schedule */
export function getAssignedSection(blocks: PlacedBlock[], courseId: string): Section | null {
  const block = blocks.find((b) => b.course.id === courseId);
  return block ? block.section : null;
}
