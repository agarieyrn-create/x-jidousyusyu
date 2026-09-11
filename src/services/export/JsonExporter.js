// JsonExporter: idea を Content Brief JSON に変換

export function ideasToJson(ideas) {
  return ideas.map(i => ({
    idea_id: i.id,
    topic: i.title,
    target: i.target || '',
    objective: i.objective || '',
    hook: i.hook || '',
    angle: i.angle || '',
    structure: i.structure || [],
    key_points: i.key_points || [],
    personal_experience_needed: i.personal_experience_needed || [],
    reference_patterns: i.reference_patterns || [],
    platform: i.platform || 'x'
  }));
}

export function ideaToBrief(idea) {
  return {
    idea_id: idea.id,
    topic: idea.title,
    target: idea.target || '',
    objective: idea.objective || '',
    hook: idea.hook || '',
    angle: idea.angle || '',
    structure: idea.structure || [],
    key_points: idea.key_points || [],
    personal_experience_needed: idea.personal_experience_needed || [],
    reference_patterns: idea.reference_patterns || [],
    platform: idea.platform || 'x'
  };
}
