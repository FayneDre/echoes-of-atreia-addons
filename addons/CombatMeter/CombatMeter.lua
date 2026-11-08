--------------------------------------------------------------
-- Combat Meter: the group's damage and healing.            --
-- The game server counts them, every hit and every heal    --
-- with who gave it, and serves them as a page this window  --
-- shows: the client's own events cannot say who healed.    --
--------------------------------------------------------------

-- Written by the build, from package.json: the version a release carries.
COMBATMETER_VERSION = "@VERSION@";

-- Where the game server serves its addon pages when the launch does not say: the server on this machine. A launch with
-- "-updsvr:http://<host>:<port>" names another one (the client keeps that option's text, which it uses for nothing else). GetConsole
-- exists only for a plugin granted the "console" group, which the .toc asks for: without it the server on this machine is used.
local DEFAULT_SERVER = "http://127.0.0.1:7790";
local PAGE = "/addon/combat-meter";

local DIALOG = "CombatMeter";
local BROWSER = "CombatMeterBrowser";
-- an icon of the game's own menu, until the addons have their own
local MENU_ICON = "v5_start_menu_11_up";

local COLOR_R = 0.85;
local COLOR_G = 0.71;
local COLOR_B = 0.42;

local announced = false;
-- the address loaded is said in the chat at the first opening only
local shown = false;
-- why the game's menu took no entry, if it refused one
local menuProblem = nil;

local function say(text)
	DisplayChatMessage(0, "[Combat Meter] " .. tostring(text), COLOR_R, COLOR_G, COLOR_B);
end

-- Whatever reading the launch option does (an error, a value that is no address), the server on this machine answers.
local function server()
	local ok, named = pcall(GetConsole, "g_launcherUpdateURL");
	if (ok and type(named) == "string" and string.find(named, "^https?://") ~= nil) then
		return (string.gsub(named, "/+$", ""));
	end
	return DEFAULT_SERVER;
end

-- The page belongs to the character named in its address, when the server sees the request come from where the game connection does.
local function load()
	local view = GetWebViewIndex(DIALOG, BROWSER);
	if (view == nil) then
		say("the window has no browser view");
		return;
	end
	local url = server() .. PAGE .. "?name=" .. tostring(UnitName("player"));
	if (not shown) then
		shown = true;
		say("page: " .. url);
	end
	-- The installed client's LoadUrlWithWebAuth loads the address in the view as it is: the installer patches it, the stock one only knew the
	-- publisher's web sign-on, which is gone.
	LoadUrlWithWebAuth(view, url);
end

-- An error here would leave the window empty without a word: it is said in the chat.
local function open()
	local ok, problem = pcall(load);
	if (not ok) then
		say("cannot open the page: " .. tostring(problem));
	end
end

function CombatMeter_Toggle()
	g_AddonName = DIALOG;
	if (CombatMeter:IsVisible() == 1) then
		CombatMeter:Hide();
		return;
	end
	CombatMeter:Show();
	-- loaded at each opening: a server that was not up the first time is reached the next
	open();
end

function CombatMeter_OnEvent(this, event, ...)
	if (event == "PLAYER_ENTERING_WORLD" and not announced) then
		announced = true;
		say("loaded " .. COMBATMETER_VERSION .. ": /dps opens the window");
		if (menuProblem ~= nil) then
			say("no entry in the game's menu: " .. menuProblem);
		end
	end
end

function CombatMeter_OnLoad()
	g_AddonName = DIALOG;
	SlashCmdList["COMBATMETER"] = CombatMeter_Toggle;
	SLASH_COMBATMETER1 = "/dps";
	SLASH_COMBATMETER2 = "/meter";
	CreateWebView(DIALOG, BROWSER);
	CombatMeter:Hide();
	CombatMeter:RegisterEvent("PLAYER_ENTERING_WORLD");
	-- an entry of the game's menu, under "Additional Functions": last, as a menu that refuses must not cost the rest. RegisterMenu exists only
	-- for a plugin granted the "menu" group, which the client grants only to the plugins it trusts: the installer's patch of game.dll adds
	-- this addon to them (TRUSTED_ADDONS in tools/gamePatch.ts, docs/game-dll.md).
	local ok, problem = pcall(RegisterMenu, "Combat Meter", "/dps", MENU_ICON);
	if (not ok) then
		-- the chat is not there yet while the addons load: said when the character enters the world
		menuProblem = tostring(problem);
	end
end
