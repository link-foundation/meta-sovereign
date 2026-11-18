import { desktopServer } from './vk-desktop-fixture.mjs';
import { serveFriendsFixture } from './vk-friends-fixture.mjs';
serveFriendsFixture(await desktopServer());
