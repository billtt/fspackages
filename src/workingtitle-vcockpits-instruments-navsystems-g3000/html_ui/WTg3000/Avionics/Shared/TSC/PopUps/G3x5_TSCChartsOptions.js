class WT_G3x5_TSCChartsOptions extends WT_G3x5_TSCPopUpElement {
    constructor() {
        super();

        this._isReady = false;
    }

    /**
     * @readonly
     * @type {WT_G3x5_TSCChartsOptionsHTMLElement}
     */
    get htmlElement() {
        return this._htmlElement;
    }

    _createHTMLElement() {
        return new WT_G3x5_TSCChartsOptionsHTMLElement();
    }

    _initButtons() {
        this._sectionAllButtonCached = new WT_CachedElement(this.htmlElement.sectionAllButton);
        this._sectionPlanButtonCached = new WT_CachedElement(this.htmlElement.sectionPlanButton);

        this.htmlElement.fitWidthButton.addButtonListener(this._onFitWidthButtonPressed.bind(this));
    }

    async _initFromHTMLElement() {
        await WT_Wait.awaitCallback(() => this.htmlElement.isInitialized, this);
        this._initButtons();
        this._isReady = true;
        this._updateFromContext();
    }

    onInit() {
        this._htmlElement = this._createHTMLElement();
        this.popUpWindow.appendChild(this.htmlElement);
        this._initFromHTMLElement();
    }

    _fitWidth() {
        if (!this.context) {
            return;
        }

        this.context.chartsPage.resetRotation();
        this.context.chartsPage.resetZoom();
        this.context.chartsPage.resetScroll();
    }

    _onFitWidthButtonPressed(button) {
        this._fitWidth();
    }

    _cleanUpButtonManagers() {
        if (this._sectionAllButtonManager) {
            this._sectionAllButtonManager.destroy();
            this._sectionPlanButtonManager.destroy();

            this._sectionAllButtonManager = null;
            this._sectionPlanButtonManager = null;
        }
    }

    _initButtonManagers() {
        this._sectionAllButtonManager = new WT_TSCSettingEnumStatusBarButtonManager(this.htmlElement.sectionAllButton, this.context.chartsPage.sectionSetting, WT_G3x5_ChartsModel.SectionMode.ALL);
        this._sectionPlanButtonManager = new WT_TSCSettingEnumStatusBarButtonManager(this.htmlElement.sectionPlanButton, this.context.chartsPage.sectionSetting, WT_G3x5_ChartsModel.SectionMode.PLAN);
    }

    _updateFromContext() {
        if (!this.context || !this._isReady) {
            return;
        }

        this._initButtonManagers();
    }

    _cleanUpContext() {
        this._cleanUpButtonManagers();
    }

    onEnter() {
        super.onEnter();

        this._updateFromContext();
    }

    _updateSectionAllButton() {
        this._sectionAllButtonCached.setAttribute("enabled", `${this.context.chartsPage.selectedChart !== null}`);
    }

    _updateSectionPlanButton() {
        let chart = this.context.chartsPage.selectedChart;
        this._sectionPlanButtonCached.setAttribute("enabled", `${chart !== null && chart.planview !== undefined}`);
    }

    _updateSectionButtons() {
        this._updateSectionAllButton();
        this._updateSectionPlanButton();
    }

    onUpdate(deltaTime) {
        if (!this._isReady) {
            return;
        }

        this._updateSectionButtons();
    }

    onExit() {
        super.onExit();

        this._cleanUpContext();
    }
}

class WT_G3x5_TSCChartsOptionsHTMLElement extends HTMLElement {
    constructor() {
        super();

        this.attachShadow({mode: "open"});
        this.shadowRoot.appendChild(this._getTemplate().content.cloneNode(true));

        this._isInit = false;
    }

    _getTemplate() {
        return WT_G3x5_TSCChartsOptionsHTMLElement.TEMPLATE;
    }

    /**
     * @readonly
     * @type {Boolean}
     */
    get isInitialized() {
        return this._isInit;
    }

    /**
     * @readonly
     * @type {WT_TSCLabeledButton}
     */
    get fitWidthButton() {
        return this._fitWidthButton;
    }

    /**
     * @readonly
     * @type {WT_TSCStatusBarButton}
     */
    get sectionAllButton() {
        return this._sectionAllButton;
    }

    /**
     * @readonly
     * @type {WT_TSCStatusBarButton}
     */
    get sectionPlanButton() {
        return this._sectionPlanButton;
    }

    async _defineChildren() {
        [
            this._fitWidthButton,
            this._lightModebutton,
            this._lightThresholdButton,
            this._sectionAllButton,
            this._sectionPlanButton
        ] = await Promise.all([
            WT_CustomElementSelector.select(this.shadowRoot, `#fitwidth`, WT_TSCLabeledButton),
            WT_CustomElementSelector.select(this.shadowRoot, `#lightmode`, WT_TSCValueButton),
            WT_CustomElementSelector.select(this.shadowRoot, `#lightthreshold`, WT_TSCValueButton),
            WT_CustomElementSelector.select(this.shadowRoot, `#sectionall`, WT_TSCStatusBarButton),
            WT_CustomElementSelector.select(this.shadowRoot, `#sectionplan`, WT_TSCStatusBarButton),
        ]);
    }

    _initSymbolRangeWindowContext() {
        let elementHandler = new WT_G3x5_TSCRangeSelectionElementHandler(WT_G3x5_NavMap.MAP_RANGE_LEVELS.filter(value => value.compare(WT_G3x5_NavMap.TRAFFIC_SYMBOL_RANGE_MAX) <= 0), this._context.instrument.unitsSettingModel);
        this._symbolRangeWindowContext = {
            title: "Map Traffic Symbol Range",
            subclass: "standardDynamicSelectionListWindow",
            closeOnSelect: true,
            callback: this._setRangeSetting.bind(this, WT_G3x5_NavMap.TRAFFIC_SYMBOL_RANGE_KEY),
            elementConstructor: elementHandler,
            elementUpdater: elementHandler,
            currentIndexGetter: new WT_G3x5_TSCMapSettingIndexGetter(this._getSettingModelID.bind(this), WT_G3x5_NavMap.TRAFFIC_SYMBOL_RANGE_KEY),
        };
    }

    _initLabelRangeWindowContext() {
        let elementHandler = new WT_G3x5_TSCRangeSelectionElementHandler(WT_G3x5_NavMap.MAP_RANGE_LEVELS.filter(value => value.compare(WT_G3x5_NavMap.TRAFFIC_LABEL_RANGE_MAX) <= 0), this._context.instrument.unitsSettingModel);
        this._labelRangeWindowContext = {
            title: "Map Traffic Label Range",
            subclass: "standardDynamicSelectionListWindow",
            closeOnSelect: true,
            callback: this._setRangeSetting.bind(this, WT_G3x5_NavMap.TRAFFIC_LABEL_RANGE_KEY),
            elementConstructor: elementHandler,
            elementUpdater: elementHandler,
            currentIndexGetter: new WT_G3x5_TSCMapSettingIndexGetter(this._getSettingModelID.bind(this), WT_G3x5_NavMap.TRAFFIC_LABEL_RANGE_KEY),
        };
    }

    async _connectedCallbackHelper() {
        await this._defineChildren();
        this._isInit = true;
    }

    connectedCallback() {
        this._connectedCallbackHelper();
    }
}
WT_G3x5_TSCChartsOptionsHTMLElement.NAME = "wt-tsc-chartsoptions";
WT_G3x5_TSCChartsOptionsHTMLElement.TEMPLATE = document.createElement("template");
WT_G3x5_TSCChartsOptionsHTMLElement.TEMPLATE.innerHTML = `
    <style>
        :host {
            display: block;
            border-radius: 5px;
            background: linear-gradient(#1f3445, black 25px);
            background-color: black;
            border: 3px solid var(--wt-g3x5-bordergray);
        }

        #wrapper {
            position: absolute;
            left: var(--chartsoptions-padding-left, 0.5em);
            top: var(--chartsoptions-padding-top, 0.5em);
            width: calc(100% - var(--chartsoptions-padding-left, 0.5em) - var(--chartsoptions-padding-right, 0.5em));
            height: calc(100% - var(--chartsoptions-padding-top, 0.5em) - var(--chartsoptions-padding-bottom, 0.5em));
            display: grid;
            grid-template-rows: 100%;
            grid-template-columns: var(--chartsoptions-leftcolumn-width, 33%) 1fr;
            grid-gap: 0 var(--chartsoptions-column-gap, 0.5em);
        }
            #left {
                position: relative;
                width: 100%;
                height: 100%;
                display: flex;
                flex-flow: column nowrap;
                justify-content: flex-end;
                align-items: stretch;
            }
                .leftButton {
                    height: var(--chartsoptions-leftcolumn-button-height, 4em);
                    margin-top: var(--chartsoptions-leftcolumn-button-margin-vertical, 0.5em);
                }
            #sectionscontainer {
                position: relative;
                border-radius: 3px;
                background: linear-gradient(#1f3445, black 25px);
                background-color: black;
                border: 3px solid var(--wt-g3x5-bordergray);
            }
                #sections {
                    position: absolute;
                    left: var(--chartsoptions-sections-padding-left, 0.2em);
                    top: var(--chartsoptions-sections-padding-top, 0.2em);
                    width: calc(100% - var(--chartsoptions-sections-padding-left, 0.2em) - var(--chartsoptions-sections-padding-right, 0.2em));
                    height: calc(100% - var(--chartsoptions-sections-padding-top, 0.2em) - var(--chartsoptions-sections-padding-bottom, 0.2em));
                }
                    #sectionstitle {
                        position: absolute;
                        left: 50%;
                        top: calc(var(--chartsoptions-sections-title-height, 1.5em) / 2);
                        transform: translate(-50%, -50%);
                    }
                    #sectionsbuttons {
                        position: absolute;
                        left: 0%;
                        top: var(--chartsoptions-sections-title-height, 1.5em);
                        width: 100%;
                        height: calc(100% - var(--chartsoptions-sections-title-height, 1.5em));
                        display: grid;
                        grid-template-columns: 100%;
                        grid-template-rows: 1fr 1fr 1fr;
                        grid-gap: var(--chartsoptions-sections-row-gap, 0.5em) 0;
                    }
                        .sectionRow {
                            display: flex;
                            justify-content: center;
                            align-items: stretch;
                        }
                            .sectionButton {
                                width: calc((100% - var(--chartsoptions-sections-button-margin-horizontal, 0.2em)) / 2);
                                margin: 0 calc(var(--chartsoptions-sections-button-margin-horizontal, 0.2em) / 2);
                            }
    </style>
    <div id="wrapper">
        <div id="left">
            <wt-tsc-button-label id="fitwidth" class="leftButton" labeltext="Fit Width"></wt-tsc-button-label>
            <wt-tsc-button-value id="lightmode" class="leftButton" labeltext="Light Mode"></wt-tsc-button-value>
            <wt-tsc-button-value id="lightthreshold" class="leftButton" labeltext="Threshold"></wt-tsc-button-value>
        </div>
        <div id="sectionscontainer">
            <div id="sections">
                <div id="sectionstitle">Sections</div>
                <div id="sectionsbuttons">
                    <div id="sectionsrow1" class="sectionRow">
                        <wt-tsc-button-statusbar id="sectionall" class="sectionButton" labeltext="All" enabled="false"></wt-tsc-button-statusbar>
                    </div>
                    <div id="sectionsrow2" class="sectionRow">
                        <wt-tsc-button-statusbar id="sectionplan" class="sectionButton" labeltext="Plan" enabled="false"></wt-tsc-button-statusbar>
                        <wt-tsc-button-statusbar id="sectionprofile" class="sectionButton" labeltext="Profile" enabled="false"></wt-tsc-button-statusbar>
                    </div>
                    <div id="sectionsrow3" class="sectionRow">
                        <wt-tsc-button-statusbar id="sectionminimums" class="sectionButton" labeltext="Minimums" enabled="false"></wt-tsc-button-statusbar>
                        <wt-tsc-button-statusbar id="sectionheader" class="sectionButton" labeltext="Header" enabled="false"></wt-tsc-button-statusbar>
                    </div>
                </div>
            </div>
        </div>
    </div>
`;

customElements.define(WT_G3x5_TSCChartsOptionsHTMLElement.NAME, WT_G3x5_TSCChartsOptionsHTMLElement);