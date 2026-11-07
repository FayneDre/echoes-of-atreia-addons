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

function CombatMeter_Toggle(arg)
	g_AddonName = "CombatMeter";
	if (CombatMeter:IsVisible() == 1) then
		CombatMeter:Hide();
		return;
	end
	CombatMeter:Show();
	-- loaded at each opening: a server that was not up the first time is reached the next
	CombatMeterBrowser:LoadUrlWithWebAuth(COMBATMETER_URL);
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
