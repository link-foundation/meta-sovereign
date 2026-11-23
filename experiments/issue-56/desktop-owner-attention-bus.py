"""Run one Electron experiment on an isolated Freedesktop notification bus."""

import asyncio
import json
import sys

from dbus_next.aio import MessageBus
from dbus_next.service import ServiceInterface, method, signal


class Notifications(ServiceInterface):
    def __init__(self):
        super().__init__('org.freedesktop.Notifications')
        self.notices = []
        self.closed = []

    @method()
    def GetCapabilities(self) -> 'as':
        return ['actions', 'body']

    @method()
    def GetServerInformation(self) -> 'ssss':
        return ['Meta Sovereign fixture', 'Meta Sovereign', '1', '1.2']

    @method()
    def Notify(self, _app: 's', _replaces: 'u', _icon: 's', title: 's', body: 's',
               actions: 'as', _hints: 'a{sv}', expires: 'i') -> 'u':
        self.notices.append({'title': title, 'body': body, 'actions': actions, 'expires': expires})
        notice_id = len(self.notices)
        action = '0' if notice_id == 1 else '1'
        asyncio.get_running_loop().call_later(0.1, self.ActionInvoked, notice_id, action)
        return notice_id

    @method()
    def CloseNotification(self, notice_id: 'u'):
        self.closed.append(notice_id)

    @signal()
    def ActionInvoked(self, notice_id, action) -> 'us':
        return [notice_id, action]


async def main(command):
    interface = Notifications()
    bus = await MessageBus().connect()
    bus.export('/org/freedesktop/Notifications', interface)
    await bus.request_name(interface.name)
    child = await asyncio.create_subprocess_exec(*command)
    try:
        status = await child.wait()
        print(json.dumps({'notices': interface.notices, 'closed': interface.closed}))
        if status:
            return status
        assert len(interface.notices) == 2
        for notice in interface.notices:
            assert notice['actions'][2:] == ['0', 'Show browser', '1', 'Later']
            assert notice['expires'] == 0
            assert 'fixture-private' not in json.dumps(notice)
        assert interface.closed == [1, 2]
        return 0
    finally:
        bus.disconnect()


if __name__ == '__main__':
    raise SystemExit(asyncio.run(main(sys.argv[1:])))
