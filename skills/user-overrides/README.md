# User Overrides

## What this folder is for

- This folder contains user-level skill manifests.
- A user manifest can override a system skill by setting overrideOf.
- User overrides take precedence when overrideOf matches an existing system skill id.
- If overrideOf is not set, the user manifest is loaded as its own skill.

## How override resolution works

- System manifests are loaded from skills/system.
- User manifests are loaded from skills/user-overrides.
- When a user manifest sets overrideOf to a loaded system skill id, it replaces that system skill at runtime.
- The final merged skill list keeps only enabled skills.

## How to add a user override

- Create a file in this folder named <your-skill>.manifest.json.
- Set `overrideOf` to the system skill id you want to replace.
- Keep required fields valid: `id, name, version, description, useWhen, compatibility.assistantCore`.
- Define requiredTools and permissions for the behavior you want.
- Run validation: `npm run dev -- skill:validate`.
- Run a smoke check with a request that should trigger the overridden skill.

## Minimal example

```json
{
	"id": "research-override",
	"name": "Research Override",
	"version": "1.0.0",
	"description": "User-specific override for research skill behavior",
	"enabled": true,
	"useWhen": ["research", "investigate"],
	"requiredTools": ["reasoning"],
	"permissions": {
		"network": false,
		"fileSystem": false,
		"shell": false,
		"allowedPaths": [],
		"blockedCommands": [],
		"maxToolCalls": 5
	},
	"entrypoints": {},
	"dependencies": [],
	"compatibility": {
		"assistantCore": ">=0.1.0 <1.0.0"
	},
	"overrideOf": "research",
	"tags": ["user-override"]
}
```

## Notes

- `overrideOf` should point to a real system skill id.
- If `overrideOf` points to a missing id, the user manifest is treated as a normal skill by its own id.
- Keep permissions minimal and expand only when needed.

