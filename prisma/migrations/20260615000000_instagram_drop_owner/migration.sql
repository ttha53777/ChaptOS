-- Drop InstagramTask.owner.
--
-- Instagram posts are no longer attributed to a member. The content calendar
-- redesign tracks what's going out and when (Story / Reel / Carousel), not who
-- owns each post. The owner column is removed entirely.
--
-- This is Instagram-only: the Deadline model keeps its owner column.
-- No sequence/grant changes — dropping a plain scalar column on an existing
-- table the app role already has privileges on.

ALTER TABLE "InstagramTask" DROP COLUMN "owner";
