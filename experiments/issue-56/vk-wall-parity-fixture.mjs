import { wallAdapter } from './vk-wall-fixture.mjs';

export const removeWallPost = (adapter, id) =>
  adapter.walls.set(
    42,
    adapter.walls.get(42).filter((post) => post.id !== id)
  );

/** Two buried owned invitations; the first delete loses a concurrent race. */
export const wallParityAdapter = (code = 100) => {
  let first = true;
  const adapter = wallAdapter({
    refusedCode: code,
    response: (step) => {
      if (step.action === 'delete' && first) {
        first = false;
        removeWallPost(adapter, step.postId);
        return 'refused';
      }
      return 'confirmed';
    },
  });
  adapter.addPost(42, 'Add me as a friend: second owned invitation');
  for (let index = 0; index < 10; index++) {
    adapter.addPost(42, `Later unrelated ${index}`, { from_id: 2 });
  }
  return adapter;
};
