--------------------------------------------------------------
-- Combat Meter: the group's damage and healing.            --
-- The game server counts them, every hit and every heal    --
-- with who gave it, and serves them as a page this window  --
-- shows: the client's own events cannot say who healed.    --
--------------------------------------------------------------

-- Written by the build, from package.json: the version a release carries.
COMBATMETER_VERSION = "@VERSION@";

-- The game server's address, until the launcher can tell it: the page is served beside the game port.
COMBATMETER_URL = "http://127.0.0.1:7790/addon/combat-meter";

local COLOR_R = 0.85;
local COLOR_G = 0.71;
local COLOR_B = 0.42;

local function say(text)
	DisplayChatMessage(0, "[Combat Meter] " .. tostring(text), COLOR_R, COLOR_G, COLOR_B);
end

-- Said once, when the character enters the world: at load time the chat may not be there to show it.
local announced = false;

-- Ways of opening the page, tried one by one with "/dps <n>": the stock web authentication answers "No SSL Enabled" before any request leaves
-- the client, so which call reaches the server is found in game. Each says in the chat whether it raised an error.
local TRIALS = {
	["1"] = { "the window's browser, with web authentication", function(url) CombatMeterBrowser:LoadUrlWithWebAuth(url); end },
	["2"] = { "the window's browser, the url in https", function(url) CombatMeterBrowser:LoadUrlWithWebAuth(string.gsub(url, "^http:", "https:")); end },
	["3"] = { "the global call, three arguments", function(url) LoadUrlWithWebAuth(CombatMeterBrowser, url, ""); end },
	["4"] = { "the game's own web window", function(url) OpenWeb(url); end },
	["5"] = { "the game's own web window, with web authentication", function(url) LoadUrlWithWebAuth(url); end },
};

local function try(number)
	local trial = TRIALS[number];
	if (trial == nil) then
		say("unknown trial " .. tostring(number) .. ": /dps 1 to /dps 5");
		return;
	end
	local ok, problem = pcall(trial[2], COMBATMETER_URL .. "?trial=" .. number);
	if (ok) then
		say("trial " .. number .. " (" .. trial[1] .. "): called");
	else
		say("trial " .. number .. " (" .. trial[1] .. "): " .. tostring(problem));
	end
end

function CombatMeter_Toggle(arg)
	g_AddonName = "CombatMeter";
	local number = arg and string.match(tostring(arg), "%d") or nil;
	if (number ~= nil) then
		CombatMeter:Show();
		try(number);
		return;
	end
	if (CombatMeter:IsVisible() == 1) then
		CombatMeter:Hide();
		return;
	end
	CombatMeter:Show();
	-- loaded at each opening: a server that was not up the first time is reached the next
	try("1");
end

function CombatMeter_OnEvent(this, event, ...)
	if (event == "PLAYER_ENTERING_WORLD" and not announced) then
		announced = true;
		say("loaded " .. COMBATMETER_VERSION .. ": /dps opens the window");
	end
end

function CombatMeter_OnLoad()
	g_AddonName = "CombatMeter";
	SlashCmdList["COMBATMETER"] = CombatMeter_Toggle;
	SLASH_COMBATMETER1 = "/dps";
	SLASH_COMBATMETER2 = "/meter";
	CombatMeterStatus:SetText("Combat Meter " .. COMBATMETER_VERSION);
	CombatMeterBrowser:CreateWebView();
	CombatMeter:Hide();
	CombatMeter:RegisterEvent("PLAYER_ENTERING_WORLD");
end
