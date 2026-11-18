# Identity replies and address preference

Open **Automations → Reply to identity questions**. The preset starts disabled in safe mode. It recognizes complete Russian “кто ты?” / “ты кто?” and “кто вы?” / “вы кто?” questions, optionally preceded by “а”. Edit the informal and formal reply text to describe yourself. The defaults are “Я программист, а ты?” and “Я программист, а Вы?”.

Preview offers only the latest unanswered incoming question in a personal VK user dialog. Groups, communities, owner messages, deleted/service messages, extra questions and ambiguous timestamps refuse, including when bypassing ordinary conditions from a chat menu. Saving and previewing never send. Confirm safe drafts individually; manual automatic delivery requires confirmation of the exact preview and retains pacing, limits, opt-outs and durable outbox protection.

The latest qualifying identity question supplies the contact's address preference. It survives later ordinary messages and a store reopen because it is derived from stored history, with the question as evidence. A later explicit agreement to use “ты” or “вы” takes precedence. Editing or deleting the evidence changes the derived preference. The contact panel identifies this source. An explicit reply address selection still overrides automatic detection.

Before typing and after outbox admission, delivery rechecks the latest message and saved action. A new message, owner reply or edit requires renewed review. Pending drafts retain their message evidence across recovery; reopening a store does not send.

CLI configuration uses `automations save <file.lino>`, `automations plan identity`, `automations run identity` and `automations review`. The same action works through the existing `/api/automations` routes in default text or binary Links Notation and offline planning: set `kind: reply-identity`, your `templates.informal` and `templates.formal`, and an incoming trigger with `recognizer: identity`.

Imported and received messages use the shared scheduler. Continuous authenticated provider watching remains a separate issue #56 acceptance criterion.
