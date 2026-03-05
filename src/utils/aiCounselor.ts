import type { Course, Section, ChatAction } from '../types';
import { ALL_COURSES } from '../data/courses';
import { computeSchedule, getAssignedSection } from './scheduleEngine';

interface AIContext {
  needToHave: Course[];
  niceToHave: Course[];
  optional: Course[];
  sectionOverrides: Record<string, string>;
}

interface AIResult {
  text: string;
  sectionOverride?: { courseId: string; sectionId: string };
  actions?: ChatAction[];
}

// Pending confirmation for conflict-causing switches
let pendingOverride: { courseId: string; sectionId: string; courseName: string; sectionLabel: string } | null = null;

type Intent =
  | 'switch_section'
  | 'conflict_query'
  | 'schedule_summary'
  | 'course_info'
  | 'prioritize_help'
  | 'confirm'
  | 'cancel'
  | 'general';

const DAY_ALIASES: Record<string, string> = {
  mon: 'Mon', monday: 'Mon',
  tue: 'Tue', tues: 'Tue', tuesday: 'Tue',
  wed: 'Wed', wednesday: 'Wed',
  thu: 'Thu', thurs: 'Thu', thursday: 'Thu',
  fri: 'Fri', friday: 'Fri',
};

// ─── Intent Classification ───

function classifyIntent(text: string): Intent {
  const t = text.toLowerCase().trim();

  // Check for action button values first (exact match)
  if (t === 'confirm_switch') return 'confirm';
  if (t === 'cancel_switch') return 'cancel';

  // Check for natural language confirmation/cancellation (only if pending)
  if (pendingOverride) {
    if (/^(yes|yeah|sure|ok|okay|do it|go ahead|proceed|yep|yup)\b/.test(t)) {
      return 'confirm';
    }
    if (/^(no|nah|nope|cancel|keep|don't|never mind)\b/.test(t)) {
      return 'cancel';
    }
  }

  if (/(switch|move|change|swap)\b/.test(t) && (findCourseInText(t) || /section/.test(t))) {
    return 'switch_section';
  }
  if (/conflict/.test(t)) return 'conflict_query';
  if (/schedule|how does .* look|looks? good|overview/.test(t)) return 'schedule_summary';
  if (/tell me about|what about|info on|details/.test(t)) return 'course_info';
  if (/prioriti[zs]e|priority|which should|recommend|suggest|curious/.test(t)) return 'prioritize_help';
  return 'general';
}

// ─── Course & Section Matching ───

function findCourseInText(text: string): Course | null {
  const t = text.toLowerCase();

  // Try exact course number match first
  for (const c of ALL_COURSES) {
    if (t.includes(c.number.toLowerCase())) return c;
  }

  // Try title substring match — prefer longest match
  let best: Course | null = null;
  let bestLen = 0;
  for (const c of ALL_COURSES) {
    const title = c.title.toLowerCase();
    const words = title.split(' ');
    for (let len = words.length; len >= 1; len--) {
      for (let start = 0; start <= words.length - len; start++) {
        const fragment = words.slice(start, start + len).join(' ');
        if (fragment.length >= 3 && t.includes(fragment) && fragment.length > bestLen) {
          best = c;
          bestLen = fragment.length;
        }
      }
    }
  }
  return best;
}

function extractDaysFromText(text: string): string[] {
  const t = text.toLowerCase();
  const found: string[] = [];
  for (const [alias, day] of Object.entries(DAY_ALIASES)) {
    if (t.includes(alias) && !found.includes(day)) {
      found.push(day);
    }
  }
  return found;
}

function findTargetSection(text: string, course: Course, currentSectionId: string | null): Section | null {
  const t = text.toLowerCase();

  // "other section" / "alternate" / "different section"
  if (/other|alternate|different|swap/.test(t) && currentSectionId) {
    const other = course.sections.find((s) => s.id !== currentSectionId);
    return other || null;
  }

  // Match by mentioned days
  const days = extractDaysFromText(text);
  if (days.length > 0) {
    return course.sections.find((s) =>
      days.some((d) => s.dayKeys.includes(d))
    ) || null;
  }

  // If course has exactly 2 sections and one is current, return the other
  if (course.sections.length === 2 && currentSectionId) {
    return course.sections.find((s) => s.id !== currentSectionId) || null;
  }

  return null;
}

// ─── Intent Handlers ───

function handleSwitchSection(text: string, ctx: AIContext): AIResult {
  // Clear any stale pending override when starting a new switch
  pendingOverride = null;

  const course = findCourseInText(text);
  if (!course) {
    return { text: "I couldn't identify which course you'd like to switch. Could you mention the course name or number?" };
  }

  const allCourses = [...ctx.needToHave, ...ctx.niceToHave];
  if (!allCourses.find((c) => c.id === course.id)) {
    return { text: `${course.title} isn't in your current schedule. Add it in the Prioritize tab first.` };
  }

  if (course.sections.length <= 1) {
    return { text: `${course.title} only has one section (${course.sections[0].days} ${course.sections[0].time}), so I can't switch it. You might need to adjust your other courses instead.` };
  }

  const currentBlocks = computeSchedule(ctx);
  const currentSection = getAssignedSection(currentBlocks, course.id);
  const target = findTargetSection(text, course, currentSection?.id || null);

  if (!target) {
    const options = course.sections.map((s) => `${s.days} ${s.time}`).join(' or ');
    return { text: `Which section would you like for ${course.title}? Available: ${options}` };
  }

  if (currentSection && target.id === currentSection.id) {
    return { text: `${course.title} is already in the ${target.days} ${target.time} section.` };
  }

  // Preview: would this create conflicts?
  const previewOverrides = { ...ctx.sectionOverrides, [course.id]: target.id };
  const previewBlocks = computeSchedule({ ...ctx, sectionOverrides: previewOverrides });
  const newConflicts = previewBlocks.filter(
    (b) => b.conflict && b.course.id === course.id
  );

  if (newConflicts.length > 0) {
    // Find what it conflicts with
    const conflictingCourses = previewBlocks
      .filter((b) =>
        b.course.id !== course.id &&
        target.dayKeys.includes(b.day) &&
        b.section.startHour < target.endHour &&
        b.section.endHour > target.startHour
      )
      .map((b) => b.course.title)
      .filter((v, i, a) => a.indexOf(v) === i);

    pendingOverride = { courseId: course.id, sectionId: target.id, courseName: course.title, sectionLabel: `${target.days} ${target.time}` };
    return {
      text: `Switching ${course.title} to ${target.days} ${target.time} would conflict with ${conflictingCourses.join(' and ')}. Want me to go ahead anyway?`,
      actions: [
        { label: 'Yes, switch it', value: 'confirm_switch' },
        { label: 'No, keep it', value: 'cancel_switch' },
      ],
    };
  }

  // No conflict — apply immediately
  return {
    text: `Done! I moved ${course.title} to ${target.days} ${target.time}. No conflicts.`,
    sectionOverride: { courseId: course.id, sectionId: target.id },
  };
}

function handleConfirm(ctx: AIContext): AIResult {
  if (!pendingOverride) {
    return { text: "I'm not sure what you're confirming. What would you like me to do?" };
  }
  const { courseId, sectionId, courseName, sectionLabel } = pendingOverride;
  pendingOverride = null;

  // Apply the override and check for remaining conflicts
  const updatedOverrides = { ...ctx.sectionOverrides, [courseId]: sectionId };
  const updatedBlocks = computeSchedule({ ...ctx, sectionOverrides: updatedOverrides });
  const remainingConflicts = new Set(
    updatedBlocks.filter((b) => b.conflict).map((b) => b.course.title)
  );

  let response = `Done! I moved ${courseName} to ${sectionLabel}.`;
  if (remainingConflicts.size > 0) {
    response += ` You still have conflicts involving ${[...remainingConflicts].join(' and ')}. Would you like me to help resolve those?`;
  } else {
    response += ' Your schedule is now conflict-free!';
  }

  return {
    text: response,
    sectionOverride: { courseId, sectionId },
  };
}

function handleCancel(): AIResult {
  pendingOverride = null;
  return { text: "Got it, I'll keep the current section. Let me know if you'd like to make any other changes." };
}

function handleConflictQuery(ctx: AIContext): AIResult {
  const blocks = computeSchedule(ctx);
  const conflicting = blocks.filter((b) => b.conflict);

  if (conflicting.length === 0) {
    return { text: "Your schedule is conflict-free! All your courses fit together nicely." };
  }

  const seen = new Set<string>();
  const descriptions: string[] = [];
  for (const block of conflicting) {
    if (seen.has(block.course.id)) continue;
    seen.add(block.course.id);

    const alts = block.course.sections.filter((s) => s.id !== block.section.id);
    let suggestion = '';
    if (alts.length > 0) {
      suggestion = ` It has an alternate section on ${alts[0].days} ${alts[0].time} — want me to switch it?`;
    }
    descriptions.push(`${block.course.title} (${block.section.days} ${block.section.time}) has a conflict.${suggestion}`);
  }

  return { text: descriptions.join('\n\n') };
}

function handleScheduleSummary(ctx: AIContext): AIResult {
  const blocks = computeSchedule(ctx);
  if (blocks.length === 0) {
    return { text: "You don't have any courses scheduled yet. Head to the Prioritize tab to set up your tiers." };
  }

  const coursesSeen = new Set<string>();
  const summary: string[] = [];
  const conflicts: string[] = [];

  for (const block of blocks) {
    if (coursesSeen.has(block.course.id)) continue;
    coursesSeen.add(block.course.id);
    const label = `${block.course.number} ${block.course.title} — ${block.section.days} ${block.section.time}`;
    summary.push(label);
    if (block.conflict) conflicts.push(block.course.title);
  }

  let response = `Your schedule has ${coursesSeen.size} course${coursesSeen.size !== 1 ? 's' : ''}:\n\n${summary.map((s) => `• ${s}`).join('\n')}`;

  if (conflicts.length > 0) {
    response += `\n\n⚠ Conflicts: ${conflicts.join(', ')}. Say "Do I have any conflicts?" for details.`;
  } else {
    response += '\n\nNo conflicts — looking good!';
  }

  return { text: response };
}

function handleCourseInfo(text: string): AIResult {
  const course = findCourseInText(text);
  if (!course) {
    return { text: "Which course would you like to know about? You can mention the name or number." };
  }

  const stars = '★'.repeat(Math.floor(course.rating)) + (course.rating % 1 >= 0.4 ? '½' : '');
  const sections = course.sections.map((s) => `${s.days} ${s.time}`).join(', ');

  return {
    text: `**${course.number} ${course.title}**\n${course.professor} · ${stars} (${course.rating})\n\n"${course.reviewQuote}"\n\nSections: ${sections}${course.isCompleted ? '\n\n(You already completed this course.)' : ''}`,
  };
}

function handlePrioritizeHelp(ctx: AIContext): AIResult {
  const allCourses = [...ctx.needToHave, ...ctx.niceToHave];
  const tips: string[] = [];

  if (allCourses.length === 0 && ctx.optional.length === 0) {
    return { text: "You haven't added any courses to prioritize yet. Head to the Discover tab to browse and add courses to your list." };
  }

  if (allCourses.length === 0 && ctx.optional.length > 0) {
    tips.push(`You have ${ctx.optional.length} course${ctx.optional.length > 1 ? 's' : ''} in your Optional list: ${ctx.optional.map((c) => c.title).join(', ')}. Consider moving some to Need-to-Have or Nice-to-Have to include them in your schedule.`);
    return { text: tips.join('\n\n') };
  }

  // Courses with only one section should be need-to-have
  const singleSection = allCourses.filter((c) => c.sections.length === 1);
  if (singleSection.length > 0) {
    tips.push(`${singleSection.map((c) => c.title).join(' and ')} only ${singleSection.length === 1 ? 'has' : 'have'} one section — consider making ${singleSection.length === 1 ? 'it' : 'them'} Need-to-Have since there's no scheduling flexibility.`);
  }

  // Highest rated courses
  const topRated = [...allCourses].sort((a, b) => b.rating - a.rating).slice(0, 2);
  tips.push(`Your highest-rated courses are ${topRated.map((c) => `${c.title} (${c.rating})`).join(' and ')}.`);

  // Optional awareness
  if (ctx.optional.length > 0) {
    tips.push(`You also have ${ctx.optional.length} course${ctx.optional.length > 1 ? 's' : ''} in Optional (${ctx.optional.map((c) => c.title).join(', ')}). These won't appear on your schedule until you move them to a priority tier.`);
  }

  // Check current conflicts
  const blocks = computeSchedule(ctx);
  const conflictCount = new Set(blocks.filter((b) => b.conflict).map((b) => b.course.id)).size;
  if (conflictCount > 0) {
    tips.push(`You currently have ${conflictCount} course${conflictCount > 1 ? 's' : ''} with scheduling conflicts.`);
  }

  return { text: tips.join('\n\n') };
}

function handleGeneral(ctx: AIContext): AIResult {
  const blocks = computeSchedule(ctx);
  const allCourses = [...ctx.needToHave, ...ctx.niceToHave];

  if (allCourses.length === 0) {
    return { text: "Hi! Start by browsing courses in the Discover tab, then come back to prioritize and build your schedule. I can help with conflicts and section choices along the way." };
  }

  const conflicting = blocks.filter((b) => b.conflict);
  if (conflicting.length > 0) {
    const names = [...new Set(conflicting.map((b) => b.course.title))];
    return { text: `I notice you have a conflict involving ${names.join(' and ')}. Would you like me to check for alternate sections?` };
  }

  return { text: `Your schedule with ${allCourses.length} courses looks clean — no conflicts! Let me know if you want to switch any sections or get course details.` };
}

// ─── Main Entry Point ───

export function generateAIResponse(userText: string, ctx: AIContext): AIResult {
  const intent = classifyIntent(userText);

  // Clear pending override on any non-confirm/non-cancel intent
  if (intent !== 'confirm' && intent !== 'cancel') {
    pendingOverride = null;
  }

  switch (intent) {
    case 'confirm':
      return handleConfirm(ctx);
    case 'cancel':
      return handleCancel();
    case 'switch_section':
      return handleSwitchSection(userText, ctx);
    case 'conflict_query':
      return handleConflictQuery(ctx);
    case 'schedule_summary':
      return handleScheduleSummary(ctx);
    case 'course_info':
      return handleCourseInfo(userText);
    case 'prioritize_help':
      return handlePrioritizeHelp(ctx);
    case 'general':
      return handleGeneral(ctx);
  }
}
