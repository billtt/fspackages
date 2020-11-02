class WT_PFD_Input_Layer extends Base_Input_Layer {
    onMenuPush(inputStack) {
        this.navSystem.showSetupMenu();
    }
}

class WT_PFD_Show_Direct_To_Handler extends WT_Show_Direct_To_Handler {
    /**
     * @param {WT_PFD_Mini_Page_Controller} miniPageController 
     * @param {WT_Direct_To_Model} directToModel 
     */
    constructor(miniPageController, directToModel, directToView, directToHandler) {
        super();
        this.miniPageController = miniPageController;
        this.directToModel = directToModel;
        this.directToView = directToView;
    }
    show(icaoType = null, icao = null) {
        const view = this.directToView;
        if (icao) {
            this.directToModel.setIcao(icao);
        }
        this.miniPageController.showPage(view).
            catch(e => {
                this.miniPageController.showPage(view);
            }).then(directTo => {
                this.miniPageController.showPage(view);
                this.directToHandler.directTo(directTo.waypoint, directTo.course);
            });
    }
}

class WT_PFD_Show_Page_Menu_Handler extends WT_Show_Page_Menu_Handler {
    /**
     * @param {Input_Stack} inputStack
     * @param {HTMLElement} pageContainer 
     */
    constructor(inputStack, pageContainer) {
        super();
        this.inputStack = inputStack;
        this.pageContainer = pageContainer;

        this.currentPageMenu = null;
    }
    show(model) {
        const view = new WT_Page_Menu_View();
        this.pageContainer.appendChild(view);
        view.setModel(model);
        view.enter(this.inputStack);
        const handler = {
            close: () => {
                view.parentNode.removeChild(view);
                this.currentPageMenu = null;
                handler.close = () => { };
            }
        };
        view.onExit.subscribe(handler.close);
        return handler;
    }
}

class WT_PFD_Model {
    /**
     * @param {WT_Brightness_Settings} brightnessSettings 
     */
    constructor(brightnessSettings) {
        this.syntheticVision = new Subject(false);
        this.lastBrightnessValue = null;
        this.brightnessKnobIndex = null;
        this.brightness = brightnessSettings;
    }
    update(dt) {
        if (this.brightnessKnobIndex !== null) {
            let brightness = Math.floor(SimVar.GetSimVarValue(`A:LIGHT POTENTIOMETER:${this.brightnessKnobIndex}`, "number") * 100);
            if (this.lastBrightnessValue != brightness) {
                console.log("brightness " + brightness);
                this.brightness.setMfdBrightness(brightness);
                this.brightness.setPfdBrightness(brightness);
                this.lastBrightnessValue = brightness;
            }
        }
    }
    setLightKnob(knob) {
        console.log("Set knob to " + knob);
        this.brightnessKnobIndex = knob;
        this.lastBrightnessValue = Math.floor(SimVar.GetSimVarValue(`A:LIGHT POTENTIOMETER:${this.brightnessKnobIndex}`, "number") * 100);
    }
    toggleSyntheticVision() {
        this.setSyntheticVision(!this.syntheticVision.value);
    }
    setSyntheticVision(enabled) {
        WTDataStore.set(`PFD.SyntheticVision`, enabled);
        this.syntheticVision.value = enabled;
    }
}

class WT_PFD_Alert_Key extends WT_Soft_Key {
    constructor() {
        super("ALERTS", null);
        this.setOnClick(this.click.bind(this));
        this.pressAcknowledgesAnnunciations = false;
    }
    /**
    * @param {WT_Annunciations_Model} annuncationsModel 
    */
    setAnnunciationsModel(model) {
        this.annunciationsModel = model;
        model.alertLevel.subscribe(this.updateAlertLevel.bind(this));
        model.hasUnacknowledgedAnnunciations.subscribe(has => {
            this.setAttribute("state", has ? "flashing" : "");
        });
    }
    click() {
        if (this.pressAcknowledgesAnnunciations)
            this.annunciationsModel.acknowledgeAll();
    }
    updateAlertLevel(level) {
        this.pressAcknowledgesAnnunciations = true;
        switch (level) {
            case 0:
                this.pressAcknowledgesAnnunciations = false;
                this.textContent = "ALERTS";
                this.setAttribute("level", "alert");
                break;
            case 1:
                this.textContent = "ADVISORY";
                this.setAttribute("level", "advisory");
                break;
            case 2:
                this.textContent = "CAUTION";
                this.setAttribute("level", "caution");
                break;
            case 3:
                this.textContent = "WARNING";
                this.setAttribute("level", "warning");
                break;
        }
    }
}
customElements.define("g1000-soft-key-alert", WT_PFD_Alert_Key);

class WT_Dependency_Missing_Error extends Error {

};

class WT_Dependency_Container {
    constructor() {
        this._factories = {};
        this._values = {};
    }
    _get(name) {
        const handler = {
            get: function (target, prop, receiver) {
                return target._get(prop);
            }
        };
        const proxy = new Proxy(this, handler);

        if (!this._values(name)) {
            if (this._factories[name]) {
                this._values[name] = this._factories[name](proxy);
            } else {
                throw new WT_Dependency_Missing_Error(`Factory not found for "${name}"`);
            }
        }
        return this._values[name];
    }
    register(name, factory) {
        this._factories[name] = factory;
    }
}

class WT_PFD_Dependencies extends WT_Dependency_Container {
    /** @returns {WT_Settings} */
    get settings() {
        return this._get("settings");
    }
    /** @returns {WT_Settings} */
    get modSettings() {
        return this._get("modSettings");
    }
    /** @returns {WT_Unit_Chooser} */
    get unitChooser() {
        return this._get("unitChooser");
    }
    /** @returns {WT_Waypoint_Repository} */
    get waypointRepository() {
        return this._get("waypointRepository");
    }
}

class AS1000_PFD extends BaseAS1000 {
    constructor() {
        super();
        this.handleReversionaryMode = false;
        this.initDuration = 7000;

        this.brightnessSettings = new WT_Brightness_Settings();
        this.model = new WT_PFD_Model(this.brightnessSettings);

        const d = new WT_PFD_Dependencies();
        //d.settings;

        // Dependencies
        d.register("inputStack", d => new Input_Stack());
        d.register("settings", d => new WT_Settings("g36", WT_Default_Settings.base));
        d.register("modSettings", d => new WT_Settings("mod", WT_Default_Settings.modBase));
        d.register("unitChooser", d => new WT_Unit_Chooser(d.settings));
        d.register("flightPlanManager", d => this.currFlightPlanManager);
        d.register("waypointRepository", d => new WT_Waypoint_Repository(this.facilityLoader));
        d.register("nearestWaypoints", d => new WT_Nearest_Waypoints_Repository(this));
        d.register("waypointQuickSelect", d => new WT_Waypoint_Quick_Select(this, this.currFlightPlanManager));
        d.register("showPageMenuHandler", d => new WT_PFD_Show_Page_Menu_Handler(d.inputStack, document.getElementById("PageMenuContainer")));
        d.register("directToHandler", d => new WT_Direct_To_Handler(null, null)); //TODO:
        d.register("showDirectToHandler", d => new WT_PFD_Show_Direct_To_Handler(d.miniPageController, d.directToModel, d.directToView, d.directToHandler));

        d.register("brightnessSettings", d => new WT_Brightness_Settings());
        d.register("barometricPressure", d => new WT_Barometric_Pressure());

        d.register("directToModel", d => new WT_Direct_To_Model(this, null, d.waypointRepository));
        d.register("directToView", d => {
            const view = new WT_Direct_To_View(d.waypointQuickSelect, d.showPageMenuHandler);
            view.classList.add("mini-page");
            d.miniPageController.appendChild(view);
            view.setModel(d.directToModel);
        });

        d.register("attitudeModel", d => new Attitude_Indicator_Model(d.syntheticVision));
        d.register("hsiModel", d => new HSIIndicatorModel(d.syntheticVision));
        d.register("altimeterModel", d => new WT_Altimeter_Model(d.barometricPressure));

        d.register("navBoxModel", d => new AS1000_PFD_Nav_Box_Model(d.unitChooser, d.flightPlanManager));
        d.register("comFrequenciesModel", d => new WT_Com_Frequencies_Model());
        d.register("navFrequenciesModel", d => new WT_Nav_Frequencies_Model());

        d.register("localTimeModel", d => new WT_Local_Time_Model(d.settings));
        d.register("oatModel", d => new WT_OAT_Model(d.unitChooser));
        d.register("transponderModel", d => new WT_Transponder_Model(d.modSettings));
        d.register("referencesModel", d => new WT_Airspeed_References_Model());
        d.register("timerModel", d => new WT_PFD_Timer_Model());
        d.register("setupMenuModel", d => new WT_PFD_Setup_Menu_Model(d.brightnessSettings));
        d.register("nearestAirportsModel", d => new WT_Nearest_Airports_Model(this, d.showDirectToHandler, d.waypointRepository, d.unitChooser, null, null, d.nearestWaypoints));
        //d.register("", d => );

        const handler = {
            get: function (target, prop, receiver) {
                return target._get(prop);
            }
        };
        this.dependencies = new Proxy(this, handler);
    }
    get templateID() { return "AS1000_PFD"; }
    connectedCallback() {
        super.connectedCallback();
        this.updatables = [];
        this.inputStack = new Input_Stack();

        this.settings = new WT_Settings("g36", WT_Default_Settings.base);
        this.modSettings = new WT_Settings("mod", WT_Default_Settings.modBase);
        this.unitChooser = new WT_Unit_Chooser(this.settings);
        this.waypointRepository = new WT_Waypoint_Repository(this.facilityLoader);
        this.nearestWaypoints = new WT_Nearest_Waypoints_Repository(this);
        this.waypointQuickSelect = new WT_Waypoint_Quick_Select(this, this.currFlightPlanManager);
        this.showPageMenuHandler = new WT_PFD_Show_Page_Menu_Handler(this.inputStack, document.getElementById("PageMenuContainer"));
        this.updatables.push(this.nearestWaypoints);
        /*this.mainPage = new AS1000_PFD_MainPage();
        this.pageGroups = [
            new NavSystemPageGroup("Main", this, [
                this.mainPage
            ]),
        ];*/
        let bgTimer = new AS1000_PFD_BackgroundTimer();
        let timerRef = new AS1000_PFD_TMRREF();
        timerRef.backgroundTimer = bgTimer;

        this.addIndependentElementContainer(new Engine("Engine", "EngineDisplay"));
        this.maxUpdateBudget = 12;
        this._pfdConfigDone = false;

        this.barometricPressure = new WT_Barometric_Pressure();
        this.updatables.push(this.barometricPressure);

        let miniPage = this.querySelector("g1000-pfd-mini-page-container");
        miniPage.handleInput(this.inputStack);
        this.miniPageController = miniPage;

        this.directToHandler = new WT_Direct_To_Handler(null, null); //TODO:
        this.directToModel = new WT_Direct_To_Model(this, null, this.waypointRepository);
        this.directToView = new WT_Direct_To_View(this.waypointQuickSelect, this.showPageMenuHandler);
        this.directToView.classList.add("mini-page");
        this.miniPageController.appendChild(this.directToView);
        this.directToView.setModel(this.directToModel);
        this.showDirectToHandler = new WT_PFD_Show_Direct_To_Handler(this.miniPageController, this.directToModel, this.directToView, this.directToHandler);

        this.initModels();

        let hsiInput = new HSI_Input_Layer(this.hsiModel);
        this.inputStack.push(hsiInput);

        this.inputStack.push(new WT_PFD_Input_Layer(this));

        this.softKeyController = this.querySelector("g1000-soft-key-menu");
        this.softKeyController.handleInput(this.inputStack);

        this.model.syntheticVision.subscribe(enabled => {
            this.getChildById("SyntheticVision").setAttribute("show-bing-map", enabled ? "true" : "false");
            this.getChildById("SyntheticVision").style.display = enabled ? "block" : "none";
        });

        this.pfdConfig().then(() => {
            console.log("PFD fully configured.");
            this._pfdConfigDone = true;
        });

        if (!this.alertsKey) {
            this.alertsKey = new WT_PFD_Alert_Key();
        }
        this.showMainMenu();
    }
    onXMLConfigLoaded(_xml) {
        super.onXMLConfigLoaded(_xml);
        this.annuncationsModel = this.initModelView(new WT_Annunciations_Model(this.xmlConfig), "g1000-annunciations");
        if (!this.alertsKey) {
            this.alertsKey = new WT_PFD_Alert_Key();
        }
        this.alertsKey.setAnnunciationsModel(this.annuncationsModel);
    }
    initModels() {
        this.attitudeModel = this.initModelView(new Attitude_Indicator_Model(this.model.syntheticVision), "glasscockpit-attitude-indicator");
        this.hsiModel = this.initModelView(new HSIIndicatorModel(), "#Compass");
        this.altimeterModel = this.initModelView(new WT_Altimeter_Model(this.barometricPressure), "glasscockpit-altimeter");

        this.navBoxModel = this.initModelView(new AS1000_PFD_Nav_Box_Model(this.unitChooser, this.currFlightPlanManager), "g1000-nav-box");
        this.comFrequenciesModel = this.initModelView(new WT_Com_Frequencies_Model(), "g1000-com-frequencies");
        this.navFrequenciesModel = this.initModelView(new WT_Nav_Frequencies_Model(), "g1000-nav-frequencies");

        this.localTimeModel = this.initModelView(new WT_Local_Time_Model(this.settings), "g1000-local-time");
        this.oatModel = this.initModelView(new WT_OAT_Model(this.unitChooser), "g1000-oat");
        this.transponderModel = this.initModelView(new WT_Transponder_Model(this.modSettings), "g1000-transponder");
        this.referencesModel = this.initModelView(new WT_Airspeed_References_Model(), "g1000-pfd-airspeed-references");
        this.timerModel = this.initModelView(new WT_PFD_Timer_Model(), "g1000-pfd-timer");
        this.setupMenuModel = this.initModelView(new WT_PFD_Setup_Menu_Model(this.brightnessSettings), "g1000-pfd-setup-menu");
        this.nearestAirportsModel = this.initModelView(new WT_Nearest_Airports_Model(this, this.showDirectToHandler, this.waypointRepository, this.unitChooser, null, this.softKeyController, this.nearestWaypoints), "g1000-pfd-nearest-airports");
    }
    initModelView(model, viewSelector) {
        let view = document.querySelector(viewSelector);
        if (!view)
            throw new Error(`${viewSelector} didn't match any views`);
        view.setModel(model);
        if (model.update)
            this.updatables.push(model);
        return model;
    }
    showTransponderMenu() {
        let menu = new WT_PFD_Transponder_Menu(this, this.transponderModel);
        this.softKeyController.setMenu(menu);
    }
    showTransponderCodeMenu() {
        let menu = new WT_PFD_Transponder_Code_Menu(this, this.transponderModel);
        this.softKeyController.setMenu(menu);
    }
    showMainMenu() {
        let menu = new WT_PFD_Main_Menu(this);
        this.softKeyController.setMenu(menu);
    }
    showPfdMenu() {
        let menu = new WT_PFD_PFD_Menu(this, this.hsiModel, this.barometricPressure);
        this.softKeyController.setMenu(menu);
    }
    showSyntheticVisionMenu() {
        let menu = new WT_PFD_Synthetic_Vision_Menu(this);
        this.softKeyController.setMenu(menu);
    }
    showAltUnitMenu() {
        let menu = new WT_PFD_Alt_Unit_Menu(this, this.barometricPressure);
        this.softKeyController.setMenu(menu);
    }
    setDefaultVfrSquawk() {

    }
    showDirectTo(icaoType = null, icao = null) {
        this.showDirectToHandler.show(icaoType, icao);
    }
    async pfdConfig() {
        let loader = new WTConfigLoader(this._xmlConfigPath);
        // We need to wait for this to finish before we can do the initial set of the light pot
        // in the line below because this can set a custom value for the avionics knob.
        await loader.loadModelFile("interior").then((dom) => { this.processInteriorConfig(dom) });
        this.avionicsKnobValue = SimVar.GetSimVarValue("A:LIGHT POTENTIOMETER:" + this.avionicsKnobIndex, "number") * 100;
        this.model.setLightKnob(this.avionicsKnobIndex);
        return Promise.resolve();
    }
    processInteriorConfig(dom) {
        this.avionicsKnobIndex = 30;
        let templates = dom.getElementsByTagName("UseTemplate");
        for (const item of templates) {
            if (item.getAttribute("Name").toLowerCase() != "asobo_as1000_pfd_template")
                continue;
            let children = item.childNodes;
            for (const item of children) {
                if (item.nodeName.toLowerCase() != "potentiometer")
                    continue;
                this.avionicsKnobIndex = item.textContent
            }
        }
    }
    onUpdate(_deltaTime) {
        for (let updatable of this.updatables) {
            updatable.update(_deltaTime);
        }
        this.settings.update(_deltaTime);
        this.modSettings.update(_deltaTime);
        this.model.update(_deltaTime);
        this.miniPageController.update(_deltaTime);
    }
    onEvent(_event) {
        this.inputStack.processEvent(_event);
    }
    showSetupMenu() {
        this.miniPageController.showSetupMenu();
    }
    parseXMLConfig() {
        super.parseXMLConfig();
        let syntheticVision = null;
        let reversionaryMode = null;
        if (this.instrumentXmlConfig) {
            syntheticVision = this.instrumentXmlConfig.getElementsByTagName("SyntheticVision")[0];
            reversionaryMode = this.instrumentXmlConfig.getElementsByTagName("ReversionaryMode")[0];
        }
        this.model.setSyntheticVision(WTDataStore.get(`PFD.SyntheticVision`, syntheticVision && syntheticVision.textContent == "True"));
        if (reversionaryMode && reversionaryMode.textContent == "True") {
            this.handleReversionaryMode = true;
        }
    }
    Update() {
        super.Update();
        if (this.handleReversionaryMode) {
            this.reversionaryMode = false;
            if (document.body.hasAttribute("reversionary")) {
                var attr = document.body.getAttribute("reversionary");
                if (attr == "true") {
                    this.reversionaryMode = true;
                }
            }
        }
    }
}
class AS1000_PFD_MainPage extends NavSystemPage {
    constructor() {
        super("Main", "Mainframe", new AS1000_PFD_MainElement());
        this.rootMenu = new SoftKeysMenu();
        this.insetMenu = new SoftKeysMenu();
        this.xpndrMenu = new SoftKeysMenu();
        this.xpndrCodeMenu = new SoftKeysMenu();
        this.pfdMenu = new SoftKeysMenu();
        this.synVisMenu = new SoftKeysMenu();
        this.altUnitMenu = new SoftKeysMenu();
        this.windMenu = new SoftKeysMenu();
        this.hsiFrmtMenu = new SoftKeysMenu();
        this.annunciations = new PFD_Annunciations();
        this.attitude = new PFD_Attitude();
        this.mapInstrument = new MapInstrumentElement();
        this.element = new NavSystemElementGroup([
            this.attitude,
            //new PFD_Compass(),
            //new PFD_OAT(unitChooser),
            this.mapInstrument,
            new PFD_Altimeter(),
            new PFD_Airspeed(),
            //this.annunciations,
            //new PFD_NavStatus(),
            //new PFD_Minimums(),
            //new PFD_RadarAltitude(),
            //new PFD_MarkerBeacon()
        ]);
    }
    init() {
        super.init();
        this.mapInstrument.setGPS(this.gps);
        this.innerMap = this.gps.getElementOfType(PFD_InnerMap);
        this.alertSoftkey = new SoftKeyElement("ALERTS", this.gps.computeEvent.bind(this.gps, "SoftKeys_ALERT"));
        this.annunciations.alertSoftkey = this.alertSoftkey;
        /*this.rootMenu.elements = [
            new SoftKeyElement(),
            new SoftKeyElement("INSET", this.activateInsetMap.bind(this)),
            new SoftKeyElement(""),
            new SoftKeyElement("PFD", this.switchToMenu.bind(this, this.pfdMenu)),
            new SoftKeyElement("OBS"),
            new SoftKeyElement("CDI", this.gps.computeEvent.bind(this.gps, "SoftKey_CDI")),
            new SoftKeyElement("ADF/DME", this.gps.computeEvent.bind(this.gps, "SoftKey_ADF_DME")),
            new SoftKeyElement("XPDR", this.switchToMenu.bind(this, this.xpndrMenu)),
            new SoftKeyElement("IDENT"),
            new SoftKeyElement("TMR/REF", this.gps.computeEvent.bind(this.gps, "Softkey_TMR_REF")),
            new SoftKeyElement("NRST", this.gps.computeEvent.bind(this.gps, "SoftKey_NRST")),
            this.alertSoftkey,
        ];*/
        this.insetMenu.elements = [
            new SoftKeyElement("OFF", this.deactivateInsetMap.bind(this)),
            new SoftKeyElement("DCLTR"),
            new SoftKeyElement(),
            new SoftKeyElement("TRAFFIC"),
            new SoftKeyElement("TOPO", this.toggleIsolines.bind(this), this.getKeyState.bind(this, "TOPO")),
            new SoftKeyElement("TERRAIN"),
            new SoftKeyElement(),
            new SoftKeyElement("NEXRAD", this.toggleNexrad.bind(this), this.getKeyState.bind(this, "NEXRAD")),
            new SoftKeyElement("XM LTNG"),
            new SoftKeyElement(),
            new SoftKeyElement("BACK", this.switchToMenu.bind(this, this.rootMenu)),
            this.alertSoftkey,
        ];
        this.xpndrMenu.elements = [
            new SoftKeyElement(),
            new SoftKeyElement(),
            new SoftKeyElement("STBY", this.gps.computeEvent.bind(this.gps, "SoftKeys_XPNDR_STBY"), this.softkeyTransponderStatus.bind(this, 1)),
            new SoftKeyElement("ON", this.gps.computeEvent.bind(this.gps, "SoftKeys_XPNDR_ON"), this.softkeyTransponderStatus.bind(this, 3)),
            new SoftKeyElement("ALT", this.gps.computeEvent.bind(this.gps, "SoftKeys_XPNDR_ALT"), this.softkeyTransponderStatus.bind(this, 4)),
            new SoftKeyElement(),
            new SoftKeyElement("VFR", this.gps.computeEvent.bind(this.gps, "SoftKeys_XPNDR_VFR")),
            new SoftKeyElement("CODE", this.switchToMenu.bind(this, this.xpndrCodeMenu)),
            new SoftKeyElement("IDENT", this.gps.computeEvent.bind(this.gps, "SoftKeys_XPNDR_IDENT")),
            new SoftKeyElement(""),
            new SoftKeyElement("BACK", this.switchToMenu.bind(this, this.rootMenu)),
            this.alertSoftkey
        ];
        this.xpndrMenu.elements[2].state = "White";
        this.xpndrCodeMenu.elements = [
            new SoftKeyElement("0", this.gps.computeEvent.bind(this.gps, "SoftKeys_XPNDR_0")),
            new SoftKeyElement("1", this.gps.computeEvent.bind(this.gps, "SoftKeys_XPNDR_1")),
            new SoftKeyElement("2", this.gps.computeEvent.bind(this.gps, "SoftKeys_XPNDR_2")),
            new SoftKeyElement("3", this.gps.computeEvent.bind(this.gps, "SoftKeys_XPNDR_3")),
            new SoftKeyElement("4", this.gps.computeEvent.bind(this.gps, "SoftKeys_XPNDR_4")),
            new SoftKeyElement("5", this.gps.computeEvent.bind(this.gps, "SoftKeys_XPNDR_5")),
            new SoftKeyElement("6", this.gps.computeEvent.bind(this.gps, "SoftKeys_XPNDR_6")),
            new SoftKeyElement("7", this.gps.computeEvent.bind(this.gps, "SoftKeys_XPNDR_7")),
            new SoftKeyElement("IDENT", this.gps.computeEvent.bind(this.gps, "SoftKeys_XPNDR_IDENT")),
            new SoftKeyElement("BKSP", this.gps.computeEvent.bind(this.gps, "SoftKeys_XPNDR_BKSP")),
            new SoftKeyElement("BACK", this.switchToMenu.bind(this, this.xpndrMenu)),
            this.alertSoftkey
        ];
        this.pfdMenu.elements = [
            new SoftKeyElement("SYN VIS", this.switchToMenu.bind(this, this.synVisMenu)),
            new SoftKeyElement("DFLTS"),
            new SoftKeyElement("WIND", this.switchToMenu.bind(this, this.windMenu)),
            new SoftKeyElement("DME", this.gps.computeEvent.bind(this.gps, "SoftKeys_PFD_DME")),
            new SoftKeyElement("BRG1", this.gps.computeEvent.bind(this.gps, "SoftKeys_PFD_BRG1")),
            new SoftKeyElement("HSI FRMT", this.switchToMenu.bind(this, this.hsiFrmtMenu)),
            new SoftKeyElement("BRG2", this.gps.computeEvent.bind(this.gps, "SoftKeys_PFD_BRG2")),
            new SoftKeyElement(""),
            new SoftKeyElement("ALT UNIT", this.switchToMenu.bind(this, this.altUnitMenu)),
            new SoftKeyElement("STD BARO"),
            new SoftKeyElement("BACK", this.switchToMenu.bind(this, this.rootMenu)),
            this.alertSoftkey
        ];
        this.synVisMenu.elements = [
            new SoftKeyElement(""),
            new SoftKeyElement(""),
            new SoftKeyElement(""),
            new SoftKeyElement(""),
            new SoftKeyElement(""),
            new SoftKeyElement(""),
            new SoftKeyElement(""),
            new SoftKeyElement(""),
            new SoftKeyElement(""),
            new SoftKeyElement(""),
            new SoftKeyElement("BACK", this.switchToMenu.bind(this, this.pfdMenu)),
            this.alertSoftkey,
        ];
        this.altUnitMenu.elements = [
            new SoftKeyElement(""),
            new SoftKeyElement(""),
            new SoftKeyElement(""),
            new SoftKeyElement(""),
            new SoftKeyElement(""),
            new SoftKeyElement("METERS"),
            new SoftKeyElement(""),
            new SoftKeyElement("IN", this.gps.computeEvent.bind(this.gps, "SoftKeys_Baro_IN"), this.softkeyBaroStatus.bind(this, "IN")),
            new SoftKeyElement("HPA", this.gps.computeEvent.bind(this.gps, "SoftKeys_Baro_HPA"), this.softkeyBaroStatus.bind(this, "HPA")),
            new SoftKeyElement(""),
            new SoftKeyElement("BACK", this.switchToMenu.bind(this, this.pfdMenu)),
            this.alertSoftkey,
        ];
        this.windMenu.elements = [
            new SoftKeyElement(""),
            new SoftKeyElement(""),
            new SoftKeyElement("OPTN 1", this.gps.computeEvent.bind(this.gps, "SoftKeys_Wind_O1"), this.softkeyWindStatus.bind(this, 1)),
            new SoftKeyElement("OPTN 2", this.gps.computeEvent.bind(this.gps, "SoftKeys_Wind_O2"), this.softkeyWindStatus.bind(this, 2)),
            new SoftKeyElement("OPTN 3", this.gps.computeEvent.bind(this.gps, "SoftKeys_Wind_O3"), this.softkeyWindStatus.bind(this, 3)),
            new SoftKeyElement("OFF", this.gps.computeEvent.bind(this.gps, "SoftKeys_Wind_Off"), this.softkeyWindStatus.bind(this, 0)),
            new SoftKeyElement(""),
            new SoftKeyElement(""),
            new SoftKeyElement(""),
            new SoftKeyElement(""),
            new SoftKeyElement("BACK", this.switchToMenu.bind(this, this.pfdMenu)),
            this.alertSoftkey
        ];
        this.hsiFrmtMenu.elements = [
            new SoftKeyElement(""),
            new SoftKeyElement(""),
            new SoftKeyElement(""),
            new SoftKeyElement(""),
            new SoftKeyElement(""),
            new SoftKeyElement("360 HSI", this.gps.computeEvent.bind(this.gps, "SoftKeys_HSI_360"), this.softkeyHsiStatus.bind(this, false)),
            new SoftKeyElement("ARC HSI", this.gps.computeEvent.bind(this.gps, "SoftKeys_HSI_ARC"), this.softkeyHsiStatus.bind(this, true)),
            new SoftKeyElement(""),
            new SoftKeyElement(""),
            new SoftKeyElement(""),
            new SoftKeyElement("BACK", this.switchToMenu.bind(this, this.pfdMenu)),
            this.alertSoftkey
        ];
        this.softKeys = this.rootMenu;
    }

    switchToMenu(_menu) {
        this.softKeys = _menu;
    }
    softkeyTransponderStatus(_state) {
        return SimVar.GetSimVarValue("TRANSPONDER STATE:1", "number") == _state ? "White" : "None";
    }
    softkeySynTerrStatus() {
        return this.gps.mainPage.syntheticVision ? "White" : "None";
    }
    softkeyBaroStatus(_state) {
        return this.gps.getElementOfType(PFD_Altimeter).getCurrentBaroMode() == _state ? "White" : "None";
    }
    softkeyHsiStatus(_arc) {
        return (SimVar.GetSimVarValue("L:Glasscockpit_HSI_Arc", "number") == 0) == _arc ? "None" : "White";
    }
    softkeyWindStatus(_state) {
        return this.gps.getElementOfType(PFD_WindData).getCurrentMode() == _state ? "White" : "None";
    }
    activateInsetMap() {
        this.gps.computeEvent("SoftKeys_InsetOn");
        this.switchToMenu(this.insetMenu);
    }
    deactivateInsetMap() {
        this.gps.computeEvent("SoftKeys_InsetOff");
        this.switchToMenu(this.rootMenu);
    }
    toggleNexrad() {
        this.gps.getElementOfType(PFD_InnerMap).toggleNexrad();
    }
    toggleIsolines() {
        this.gps.getElementOfType(PFD_InnerMap).toggleIsolines();
    }
    getKeyState(_keyName) {
        switch (_keyName) {
            case "TOPO":
                {
                    if (this.innerMap.getIsolines())
                        return "White";
                    break;
                }
            case "NEXRAD":
                {
                    if (this.innerMap.getNexrad())
                        return "White";
                    break;
                }
        }
        return "None";
    }
}
class AS1000_PFD_MainElement extends NavSystemElement {
    init(root) {
    }
    onEnter() {
    }
    onUpdate(_deltaTime) {
    }
    onExit() {
    }
    onEvent(_event) {
    }
}
class AS1000_PFD_APDisplay extends NavSystemElement {
    constructor() {
        super(...arguments);
        this.altimeterIndex = 0;
    }
    init(root) {
        this.AP_LateralActive = this.gps.getChildById("AP_Lateral_Active");
        this.AP_LateralArmed = this.gps.getChildById("AP_Lateral_Armed");
        this.AP_Status = this.gps.getChildById("AP_Status");
        this.AP_VerticalActive = this.gps.getChildById("AP_Vertical_Active");
        this.AP_ModeReference = this.gps.getChildById("AP_Vertical_Reference");
        this.AP_Armed = this.gps.getChildById("AP_Vertical_Armed");
        if (this.gps.instrumentXmlConfig) {
            let altimeterIndexElems = this.gps.instrumentXmlConfig.getElementsByTagName("AltimeterIndex");
            if (altimeterIndexElems.length > 0) {
                this.altimeterIndex = parseInt(altimeterIndexElems[0].textContent) + 1;
            }
        }
        SimVar.SetSimVarValue("K:AP_ALT_VAR_SET_ENGLISH", "feet", 10000);
    }
    onEnter() {
    }
    onUpdate(_deltaTime) {
        Avionics.Utils.diffAndSet(this.AP_Status, SimVar.GetSimVarValue("AUTOPILOT MASTER", "Bool") ? "AP" : "");
        if (SimVar.GetSimVarValue("AUTOPILOT PITCH HOLD", "Boolean")) {
            Avionics.Utils.diffAndSet(this.AP_VerticalActive, "PIT");
            Avionics.Utils.diffAndSet(this.AP_ModeReference, "");
        }
        else if (SimVar.GetSimVarValue("AUTOPILOT AIRSPEED HOLD", "Boolean")) {
            Avionics.Utils.diffAndSet(this.AP_VerticalActive, "FLC");
            if (SimVar.GetSimVarValue("L:XMLVAR_AirSpeedIsInMach", "Boolean")) {
                Avionics.Utils.diffAndSet(this.AP_ModeReference, "M" + fastToFixed(SimVar.GetSimVarValue("AUTOPILOT AIRSPEED HOLD VAR", "mach"), 3));
            }
            else {
                Avionics.Utils.diffAndSet(this.AP_ModeReference, fastToFixed(SimVar.GetSimVarValue("AUTOPILOT AIRSPEED HOLD VAR", "knots"), 0) + "KT");
            }
        }
        else if (SimVar.GetSimVarValue("AUTOPILOT FLIGHT LEVEL CHANGE", "Boolean")) {
            Avionics.Utils.diffAndSet(this.AP_VerticalActive, "FLC");
            Avionics.Utils.diffAndSet(this.AP_ModeReference, fastToFixed(SimVar.GetSimVarValue("AUTOPILOT AIRSPEED HOLD VAR", "knots"), 0) + "KT");
        }
        else if (SimVar.GetSimVarValue("AUTOPILOT ALTITUDE LOCK", "Boolean")) {
            if (SimVar.GetSimVarValue("AUTOPILOT ALTITUDE ARM", "Boolean")) {
                Avionics.Utils.diffAndSet(this.AP_VerticalActive, "ALTS");
            }
            else {
                Avionics.Utils.diffAndSet(this.AP_VerticalActive, "ALT");
            }
            Avionics.Utils.diffAndSet(this.AP_ModeReference, fastToFixed(SimVar.GetSimVarValue("AUTOPILOT ALTITUDE LOCK VAR:2", "feet"), 0) + "FT");
        }
        else if (SimVar.GetSimVarValue("AUTOPILOT VERTICAL HOLD", "Boolean")) {
            Avionics.Utils.diffAndSet(this.AP_VerticalActive, "VS");
            Avionics.Utils.diffAndSet(this.AP_ModeReference, fastToFixed(SimVar.GetSimVarValue("AUTOPILOT VERTICAL HOLD VAR", "feet per minute"), 0) + "FPM");
        }
        else if (SimVar.GetSimVarValue("AUTOPILOT GLIDESLOPE ACTIVE", "Boolean")) {
            Avionics.Utils.diffAndSet(this.AP_VerticalActive, "GS");
            Avionics.Utils.diffAndSet(this.AP_ModeReference, "");
        }
        else {
            Avionics.Utils.diffAndSet(this.AP_VerticalActive, "");
            Avionics.Utils.diffAndSet(this.AP_ModeReference, "");
        }
        if (SimVar.GetSimVarValue("AUTOPILOT ALTITUDE ARM", "Boolean")) {
            Avionics.Utils.diffAndSet(this.AP_Armed, "ALT");
        }
        else if (SimVar.GetSimVarValue("AUTOPILOT GLIDESLOPE ARM", "Boolean")) {
            Avionics.Utils.diffAndSet(this.AP_Armed, "GS");
        }
        else if (SimVar.GetSimVarValue("AUTOPILOT VERTICAL HOLD", "Boolean")) {
            Avionics.Utils.diffAndSet(this.AP_Armed, "ALTS");
        }
        else {
            Avionics.Utils.diffAndSet(this.AP_Armed, "");
        }
        if (SimVar.GetSimVarValue("AUTOPILOT WING LEVELER", "Boolean")) {
            Avionics.Utils.diffAndSet(this.AP_LateralActive, "LVL");
        }
        else if (SimVar.GetSimVarValue("AUTOPILOT BANK HOLD", "Boolean")) {
            Avionics.Utils.diffAndSet(this.AP_LateralActive, "ROL");
        }
        else if (SimVar.GetSimVarValue("AUTOPILOT HEADING LOCK", "Boolean")) {
            Avionics.Utils.diffAndSet(this.AP_LateralActive, "HDG");
        }
        else if (SimVar.GetSimVarValue("AUTOPILOT NAV1 LOCK", "Boolean")) {
            if (SimVar.GetSimVarValue("GPS DRIVES NAV1", "Boolean")) {
                Avionics.Utils.diffAndSet(this.AP_LateralActive, "GPS");
            }
            else {
                if (SimVar.GetSimVarValue("NAV HAS LOCALIZER:" + SimVar.GetSimVarValue("AUTOPILOT NAV SELECTED", "Number"), "Boolean")) {
                    Avionics.Utils.diffAndSet(this.AP_LateralActive, "LOC");
                }
                else {
                    Avionics.Utils.diffAndSet(this.AP_LateralActive, "VOR");
                }
            }
        }
        else if (SimVar.GetSimVarValue("AUTOPILOT BACKCOURSE HOLD", "Boolean")) {
            Avionics.Utils.diffAndSet(this.AP_LateralActive, "BC");
        }
        else if (SimVar.GetSimVarValue("AUTOPILOT APPROACH HOLD", "Boolean")) {
            if (SimVar.GetSimVarValue("GPS DRIVES NAV1", "Boolean")) {
                Avionics.Utils.diffAndSet(this.AP_LateralActive, "GPS");
            }
            else {
                if (SimVar.GetSimVarValue("NAV HAS LOCALIZER:" + SimVar.GetSimVarValue("AUTOPILOT NAV SELECTED", "Number"), "Boolean")) {
                    Avionics.Utils.diffAndSet(this.AP_LateralActive, "LOC");
                }
                else {
                    Avionics.Utils.diffAndSet(this.AP_LateralActive, "VOR");
                }
            }
        }
        else {
            Avionics.Utils.diffAndSet(this.AP_LateralActive, "");
        }
        if (SimVar.GetSimVarValue("AUTOPILOT HEADING LOCK", "Bool") || SimVar.GetSimVarValue("AUTOPILOT WING LEVELER", "Bool")) {
            if (SimVar.GetSimVarValue("AUTOPILOT NAV1 LOCK", "Boolean")) {
                if (SimVar.GetSimVarValue("GPS DRIVES NAV1", "Boolean")) {
                    Avionics.Utils.diffAndSet(this.AP_LateralArmed, "GPS");
                }
                else {
                    if (SimVar.GetSimVarValue("NAV HAS LOCALIZER:" + SimVar.GetSimVarValue("AUTOPILOT NAV SELECTED", "Number"), "Boolean")) {
                        Avionics.Utils.diffAndSet(this.AP_LateralArmed, "LOC");
                    }
                    else {
                        Avionics.Utils.diffAndSet(this.AP_LateralArmed, "VOR");
                    }
                }
            }
            else if (SimVar.GetSimVarValue("AUTOPILOT BACKCOURSE HOLD", "Boolean")) {
                Avionics.Utils.diffAndSet(this.AP_LateralArmed, "BC");
            }
            else if (SimVar.GetSimVarValue("AUTOPILOT APPROACH HOLD", "Boolean")) {
                if (SimVar.GetSimVarValue("GPS DRIVES NAV1", "Boolean")) {
                    Avionics.Utils.diffAndSet(this.AP_LateralArmed, "GPS");
                }
                else {
                    if (SimVar.GetSimVarValue("NAV HAS LOCALIZER:" + SimVar.GetSimVarValue("AUTOPILOT NAV SELECTED", "Number"), "Boolean")) {
                        Avionics.Utils.diffAndSet(this.AP_LateralArmed, "LOC");
                    }
                    else {
                        Avionics.Utils.diffAndSet(this.AP_LateralArmed, "VOR");
                    }
                }
            }
            else {
                Avionics.Utils.diffAndSet(this.AP_LateralArmed, "");
            }
        }
        else {
            Avionics.Utils.diffAndSet(this.AP_LateralArmed, "");
        }
    }
    onExit() {
    }
    onEvent(_event) {
    }
}
class AS1000_PFD_WaypointLine extends MFD_WaypointLine {
    onEvent(_subIndex, _event) {
        switch (_event) {
            case "NavigationSmallInc":
            case "NavigationSmallDec":
                switch (_subIndex) {
                    case 0:
                        this.element.gps.switchToPopUpPage(this.element.waypointWindow, this.element.onWaypointSelectionEnd.bind(this.element));
                        this.element.selectedIndex = this.index;
                        break;
                    case 1:
                        this.element.selectedIndex = this.index;
                        this.element.editAltitude(this.waypointType, this.index);
                        break;
                }
                return true;
            case "CLR":
            case "CLR_Push":
                this.element.removeWaypoint(this.index);
                break;
        }
        return false;
    }
}
class AS1000_PFD_ApproachWaypointLine extends MFD_ApproachWaypointLine {
    onEvent(_subIndex, _event) {
        switch (_event) {
            case "NavigationSmallInc":
            case "NavigationSmallDec":
                switch (_subIndex) {
                    case 0:
                        this.element.gps.switchToPopUpPage(this.element.waypointWindow, this.element.onWaypointSelectionEnd.bind(this.element));
                        this.element.selectedIndex = this.index;
                        break;
                    case 1:
                        this.element.selectedIndex = this.index;
                        this.element.editAltitude(4, this.index);
                        break;
                }
                return true;
            case "CLR":
            case "CLR_Push":
                this.element.removeWaypoint(this.index);
                break;
        }
        return false;
    }
}
class AS1000_PFD_ActiveFlightPlan_Element extends MFD_ActiveFlightPlan_Element {
    constructor(_nbLines = 5) {
        super(AS1000_PFD_WaypointLine, AS1000_PFD_ApproachWaypointLine, _nbLines);
        this.isPopup = true;
    }
    init(_root) {
        super.init(_root);
        this.root = _root;
    }
    onEnter() {
        super.onEnter();
        this.root.setAttribute("state", "Active");
    }
    onExit() {
        super.onEnter();
        this.root.setAttribute("state", "Inactive");
    }
    onWaypointSelectionEnd() {
        super.onWaypointSelectionEnd();
        this.gps.popUpElement = this.container;
        this.gps.popUpElement.onEnter();
    }
}

class AS1000_PFD_ConfigMenu extends NavSystemElement {
    init(root) {
        this.pfdConfWindow = this.gps.getChildById("PfdConfWindow");
        this.pfdBrightLevel = this.gps.getChildById("pfdBrightLevel");
        this.mfdBrightLevel = this.gps.getChildById("mfdBrightLevel")
        this.slider = this.gps.getChildById("pfdSlider");
        this.sliderCursor = this.gps.getChildById("pfdSliderCursor");
        this.defaultSelectables = [
            new SelectableElement(this.gps, this.pfdBrightLevel, this.pfdBrightCallback.bind(this)),
            new SelectableElement(this.gps, this.mfdBrightLevel, this.mfdBrightCallback.bind(this))
        ];
    }
    onEnter() {
        this.pfdConfWindow.setAttribute("state", "Active");
        this.gps.ActiveSelection(this.defaultSelectables)
    }
    onUpdate(_deltaTime) {
        this.pfdBrightLevel.textContent = this.gps.getBrightness("PFD") + "%";
        this.mfdBrightLevel.textContent = this.gps.getBrightness("MFD") + "%";
    }
    onExit() {
        this.pfdConfWindow.setAttribute("state", "Inactive");
        this.gps.SwitchToInteractionState(0);
    }
    onEvent(_event) {
    }
    pfdBrightCallback(_event) {
        this.setBrightCallback(_event, "PFD")
    }
    mfdBrightCallback(_event) {
        this.setBrightCallback(_event, "MFD")
    }

    setBrightCallback(_event, display) {
        if (_event == "FMS_Upper_INC" || _event == "NavigationSmallInc") {
            this.gps.setBrightness(display, 10, true)
        } else if (_event == "FMS_Upper_DEC" || _event == "NavigationSmallDec") {
            this.gps.setBrightness(display, -10, true)
        }
    }
}
registerInstrument("as1000-pfd-element", AS1000_PFD);
//# sourceMappingURL=AS1000_PFD.js.map