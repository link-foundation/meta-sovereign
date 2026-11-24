import { friendsServer, serveFriendsFixture } from './vk-friends-fixture.mjs';
serveFriendsFixture(await friendsServer());
