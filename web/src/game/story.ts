import config from '../data/adventure-story.json';
import { dialogueTemplates } from '../data/interactions';
import type { Dialogue } from '../data/interactions';
import type { SceneData } from '../codec/scenes';

/** テンプレートIDから物語を参照し、会話履歴は冒険中だけ保持する。進行を通行条件にはしない。 */
export function createStory(scenes: readonly SceneData[]) {
  const available = new Set(scenes.flatMap(scene => scene.entities.flatMap(entity => {
    const dialogue = entity.dialogue;
    const role = dialogue?.type === 'template' ? dialogueTemplates[dialogue.id].storyRole : undefined;
    return role ? [role] : [];
  })));
  const heard = new Set<string>();
  const chapters = config.chapters.filter(chapter => chapter.roles.every(role => available.has(role)));
  return {
    get ending() { return available.size ? config.ending : null; },
    record(dialogue?: Dialogue): void {
      const role = dialogue?.type === 'template' ? dialogueTemplates[dialogue.id].storyRole : undefined;
      if (role && available.has(role)) heard.add(role);
    },
    summary(cleared: boolean) {
      if (!available.size) return null;
      return { title: config.title, objective: cleared ? config.clearedObjective : chapters.find(chapter => chapter.roles.some(role => !heard.has(role)))?.objective ?? config.finalObjective };
    },
    reset(): void { heard.clear(); },
  };
}
