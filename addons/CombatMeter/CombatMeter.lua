--------------------------------------------------------------
-- Combat Meter: the group's damage and healing.            --
-- The game server counts them, every hit and every heal    --
-- with who gave it, and serves them as a page this window  --
-- shows: the client's own events cannot say who healed.    --
--------------------------------------------------------------

COMBATMETER_VERSION = "0.1.0";

-- The game server's address, until the launcher can tell it: the page is served beside the game port.
COMBATMETER_URL = "http://127.0.0.1:7790/addon/combat-meter";

local COLOR_R = 0.85;
local COLOR_G = 0.71;
local COLOR_B = 0.42;

local function say(text)
	DisplayChatMessage(0, "[Combat Meter] " .. tostring(text), COLOR_R, COLOR_G, COLOR_B);
end

local loaded = false;

function CombatMeter_Toggle(arg)
	g_AddonName = "CombatMeter";
	if (CombatMeter:IsVisible() == 1) then
		CombatMeter:Hide();
		return;
	end
	CombatMeter:Show();
	if (not loaded) then
		CombatMeterBrowser:LoadUrlWithWebAuth(COMBATMETER_URL);
		loaded = true;
	end
end

function CombatMeter_OnEvent(this, event, ...)
end

function CombatMeter_OnLoad()
	g_AddonName = "CombatMeter";
	SlashCmdList["COMBATMETER"] = CombatMeter_Toggle;
	SLASH_COMBATMETER1 = "/dps";
	SLASH_COMBATMETER2 = "/meter";
	CombatMeterStatus:SetText("Combat Meter " .. COMBATMETER_VERSION);
	CombatMeterBrowser:CreateWebView();
	CombatMeter:Hide();
	say("loaded " .. COMBATMETER_VERSION .. ": /dps opens the window");
end
