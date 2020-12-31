/**
 * The ACT/MOD holds and holds list pages for the FMC.
 */
class CJ4_FMC_HoldsPage {
  
  /**
   * Creates an instance of the holds page controller.
   * @param {CJ4_FMC} fmc The instance of the FMC to use with this instance. 
   */
  constructor(fmc) {
    
    /** The FMC instance. */
    this._fmc = fmc;

    /** The page state. */
    this._state = {
      pageNumber: 1,
      fromWaypointIndex: 0,
      isModifying: false,
      page: CJ4_FMC_HoldsPage.FPLN_HOLD
    };
  }

  /**
   * Initializes the holds page instance.
   */
  prepare() {
    this.update(true);
  }

  /**
   * Updates the holds page.
   * @param {boolean} forceUpdate Whether or not to force the page update. 
   */
  update(forceUpdate = false) {
    this._fmc.clearDisplay();
    const currentHolds = CJ4_FMC_HoldsPage.getFlightplanHolds(this._fmc);

    if (currentHolds.length === 0) {
      CJ4_FMC_LegsPage.ShowPage1(this._fmc, true);
    }
    else {
      if (this._state.page === CJ4_FMC_HoldsPage.HOLD_LIST) {
        if (currentHolds.length > 1) {
          this.bindHoldListInputs(currentHolds);
          this.renderHoldList(currentHolds);
        }
        else {
          this._state.page = CJ4_FMC_HoldsPage.FPLN_HOLD;
        }
      }
  
      if (this._state.page === CJ4_FMC_HoldsPage.FPLN_HOLD) {
        this._state.fromWaypointIndex = this._fmc.flightPlanManager.getActiveWaypointIndex() - 1;

        if (this._state.pageNumber > currentHolds.length) {
          this._state.pageNumber = currentHolds.length;
        }

        if (this._state.pageNumber < 1) {
          this._state.pageNumber = 1;
        }
  
        const currentHold = currentHolds[this._state.pageNumber - 1];
        const eteSeconds = this.calculateETE(currentHold.index);
  
        this.bindFplnHoldInputs(currentHold, currentHolds.length);
        this.renderFplnHold(currentHold, eteSeconds, currentHolds.length);
      }
    }
  }

  /**
   * Binds LSK behavior for the FPLN HOLD page.
   * @param {{waypoint: WayPoint, index: number}} currentHold The current hold that is being displayed.
   * @param {number} numHolds The total number of holds currently in the plan.
   */
  bindFplnHoldInputs(currentHold, numHolds) { 
    this._fmc.onLeftInput[2] = () => this.changeHoldCourse(currentHold);
    this._fmc.onLeftInput[3] = () => this.changeHoldTime(currentHold);
    this._fmc.onLeftInput[4] = () => this.changeHoldDistance(currentHold);
    
    this._fmc.onRightInput[0] = () => this.toggleSpeedType(currentHold);

    if (numHolds < 6) {
      this._fmc.onRightInput[4] = () => CJ4_FMC_LegsPage.ShowPage1(this._fmc, true);
    }

    if (this._state.fromWaypointIndex === currentHold.index) {
      this._fmc.onRightInput[5] = () => this.handleExitHold(currentHold);
    }

    if (this._state.isModifying) {
      this._fmc.onLeftInput[5] = () => this.handleCancelMod();
    }

    this._fmc.onPrevPage = () => { this._state.pageNumber--; this.update(); };
    this._fmc.onNextPage = () => { this._state.pageNumber++; this.update(); };
    this._fmc.onExecPage = () => this.handleExec();
  }

  /**
   * Binds LSK behavior for the HOLD LIST page.
   * @param {{waypoint: WayPoint, index: number}[]} currentHolds The current holds that are being displayed.
   */
  bindHoldListInputs(currentHolds) {
    for (let i = 0; i < 6; i++) {
      if (i < 5 && currentHolds[i] !== undefined) {
        this._fmc.onLeftInput[i] = () => CJ4_FMC_HoldsPage.showHoldPage(this._fmc, currentHolds[i].waypoint.ident);
      }
      else if (i >= 5 && currentHolds[i] !== undefined) {
        this._fmc.onRightInput[i - 5] = () => CJ4_FMC_HoldsPage.showHoldPage(this._fmc, currentHolds[i].waypoint.ident);
      }
    }

    if (this._state.isModifying) {
      this._fmc.onLeftInput[5] = () => this.handleCancelMod();
    }

    if (currentHolds.length < 6) {
      this._fmc.onRightInput[5] = () => CJ4_FMC_LegsPage.ShowPage1(this._fmc, true);
    }
  }

  /**
   * Changes the hold's inbound course.
   * @param {{waypoint: WayPoint, index: number}} currentHold The current hold to change the course for.
   */
  changeHoldCourse(currentHold) {
    const input = String(this._fmc.inOut);
    const parser = /(\d{3})(T?)\/(R|L)/;

    if (parser.test(input)) {
      this._fmc.inOut = '';
      const matches = parser.exec(input);

      const course = parseInt(matches[1]);
      const isTrueCourse = matches[2] === 'T';
      const isLeftTurn = matches[3] === 'L';

      this._fmc.ensureCurrentFlightPlanIsTemporary(() => {
        const newDetails = Object.assign({}, currentHold.waypoint.holdDetails);

        newDetails.holdCourse = course;
        newDetails.isHoldCourseTrue = isTrueCourse;
        newDetails.turnDirection = isLeftTurn ? HoldTurnDirection.Left : HoldTurnDirection.Right;
        newDetails.entryType = HoldDetails.calculateEntryType(course, currentHold.waypoint.bearingInFP);

        this._state.isModifying = true;
        this._fmc.fpHasChanged = true;
        this._fmc.flightPlanManager.addHoldAtWaypointIndex(currentHold.index, newDetails)
          .then(() => this.update());
      });
    }
    else {
      this._fmc.showErrorMessage('INVALID ENTRY');
    }
  }

  /**
   * Changes the hold's leg time.
   * @param {{waypoint: WayPoint, index: number}} currentHold The current hold to change the leg time for.
   */
  changeHoldTime(currentHold) {
    const input = parseFloat(this._fmc.inOut);

    if (!isNaN(input)) {
      this._fmc.inOut = '';

      const groundSpeed = Math.min(Simplane.getGroundSpeed(), 120);
      const distance = input * (groundSpeed / 60);

      this._fmc.ensureCurrentFlightPlanIsTemporary(() => {
        const newDetails = Object.assign({}, currentHold.waypoint.holdDetails);

        newDetails.speed = groundSpeed;
        newDetails.legTime = input * 60;
        newDetails.legDistance = distance;

        this._state.isModifying = true;
        this._fmc.fpHasChanged = true;
        this._fmc.flightPlanManager.addHoldAtWaypointIndex(currentHold.index, newDetails)
          .then(() => this.update());
      });
    }
    else {
      this._fmc.showErrorMessage('INVALID ENTRY');
    }
  }

  /**
   * Changes the hold's leg time.
   * @param {{waypoint: WayPoint, index: number}} currentHold The current hold to change the leg time for.
   */
  changeHoldDistance(currentHold) {
    const input = parseFloat(this._fmc.inOut);

    if (!isNaN(input)) {
      this._fmc.inOut = '';

      const groundSpeed = Math.min(Simplane.getGroundSpeed(), 120);
      const timeSeconds = input / (groundSpeed / 3600);

      this._fmc.ensureCurrentFlightPlanIsTemporary(() => {
        const newDetails = Object.assign({}, currentHold.waypoint.holdDetails);

        newDetails.speed = groundSpeed;
        newDetails.legTime = timeSeconds;
        newDetails.legDistance = input;

        this._state.isModifying = true;
        this._fmc.fpHasChanged = true;
        this._fmc.flightPlanManager.addHoldAtWaypointIndex(currentHold.index, newDetails)
          .then(() => this.update());
      });
    }
    else {
      this._fmc.showErrorMessage('INVALID ENTRY');
    }
  }

  /**
   * Toggles the hold's max speed type.
   * @param {{waypoint: WayPoint, index: number}} currentHold The current hold to change the max speed type for. 
   */
  toggleSpeedType(currentHold) {
    const speedType = currentHold.waypoint.holdDetails.holdSpeedType === HoldSpeedType.FAA ? HoldSpeedType.ICAO : HoldSpeedType.FAA;
    this._fmc.ensureCurrentFlightPlanIsTemporary(() => {
      const newDetails = Object.assign({}, currentHold.waypoint.holdDetails);
      newDetails.holdSpeedType = speedType;

      this._state.isModifying = true;
      this._fmc.flightPlanManager.addHoldAtWaypointIndex(currentHold.index, newDetails)
        .then(() => this.update());
    });
  }

  /**
   * Renders the FPLN HOLD page.
   * @param {{waypoint: WayPoint, index: number}} currentHold The current hold. 
   * @param {number} eteSeconds The ETE to the hold fix in seconds.
   * @param {number} numPages The total number of pages.
   */
  renderFplnHold(currentHold, eteSeconds, numPages) {
    const actMod = this._state.isModifying ? 'MOD[white]' : 'ACT[blue]';
    const ete = `${Math.floor(eteSeconds / 60)}:${eteSeconds % 60}`;

    const holdDetails = currentHold.waypoint.holdDetails;
    const speedSwitch = this._fmc._templateRenderer.renderSwitch(["FAA", "ICAO"], holdDetails.holdSpeedType === HoldSpeedType.FAA ? 0 : 1);
    

    const rows = [
      [`${actMod} FPLN HOLD[blue]`, `${this._state.pageNumber}/${numPages}[blue]`],
      [' FIX[blue]', 'HOLD SPD [blue]', 'ENTRY[blue]'],
      [`${currentHold.waypoint.ident}`, speedSwitch, CJ4_FMC_HoldsPage.getEntryTypeString(holdDetails.entryType)],
      [' QUAD/RADIAL[blue]', 'MAX KIAS [blue]'],
      ['--/---°', this.getMaxKIAS(holdDetails).toFixed(0)],
      [' INBD CRS/DIR[blue]', 'FIX ETE [blue]'],
      [`${holdDetails.holdCourse.toFixed(0).padStart(3, '0')}${holdDetails.isHoldCourseTrue ? 'T' : ''}°/${holdDetails.turnDirection === HoldTurnDirection.Left ? 'L' : 'R'} TURN`, `${ete}[s-text]`],
      [' LEG TIME[blue]', 'EFC TIME [blue]'],
      [`${(holdDetails.legTime / 60).toFixed(1)}[d-text] MIN[s-text]`, '--:--'],
      [' LEG DIST[blue]'],
      [`${holdDetails.legDistance.toFixed(1)}[d-text] NM[s-text]`, `${numPages < 6 ? 'NEW HOLD>' : ''}`],
      ['------------------------[blue]'],
      [`${this._state.isModifying ? '<CANCEL MOD' : ''}`, `${this._state.fromWaypointIndex === currentHold.index ? 'EXIT HOLD>' : ''}`]
    ];

    this._fmc._templateRenderer.setTemplateRaw(rows);
  }

  /**
   * Renders the HOLD LIST page.
   * @param {{waypoint: WayPoint, index: number}[]} currentHolds The current holds. 
   */
  renderHoldList(currentHolds) {
    const actMod = this._state.isModifying ? 'MOD[white]' : 'ACT[blue]';
    const getLine = (holdIndex) => currentHolds[holdIndex] !== undefined ? currentHolds[holdIndex].waypoint.ident : '';

    const rows = [
      [`${actMod} HOLD LIST[blue]`, '1/1[blue]'],
      [''],
      [`${getLine(0)}`, `${getLine(5)}`],
      [''],
      [`${getLine(1)}`],
      [''],
      [`${getLine(2)}`],
      [''],
      [`${getLine(3)}`],
      [''],
      [`${getLine(4)}`],
      [''],
      [`${this._state.isModifying ? '<CANCEL MOD' : ''}`, `${currentHolds.length < 6 ? 'NEW HOLD>' : ''}`]
    ];

    this._fmc._templateRenderer.setTemplateRaw(rows);
  }

  /**
   * Handles when CANCEL MOD is pressed.
   */
  handleCancelMod() {
    if (this._fmc.flightPlanManager.getCurrentFlightPlanIndex() === 1) {
      this._fmc.eraseTemporaryFlightPlan(() => {
        this._fmc.fpHasChanged = false;
        this._state.isModifying = false;
        this.update();
      });
    }
  }

  /**
   * Handles when EXEC is pressed.
   */
  handleExec() {
    if (this._fmc.fpHasChanged) {
      this._fmc.fpHasChanged = false;
      this._state.isModifying = false;
      
      this._fmc.activateRoute(() => {
          this.update();
          this._fmc.onExecDefault();
      });
    }
  }

  /**
   * Handles when EXIT HOLD is pressed.
   * @param {{waypoint: WayPoint, index: number}} currentHold The current hold. 
   */
  handleExitHold(currentHold) {
    this._fmc.exitHoldAtIndex(currentHold.index);
  }

  /**
   * Handles when CANCEL EXIT is pressed.
   * @param {{waypoint: WayPoint, index: number}} currentHold The current hold. 
   */
  handleCancelExit(currentHold) {
    this._fmc.cancelExitHoldAtIndex(currentHold.index);
  }

  /**
   * Gets the maximum KIAS for the hold given the hold speed regulation selection.
   * @param {HoldDetails} holdDetails The details about the given hold.
   * @returns {number} The maximum hold speed in KIAS.
   */
  getMaxKIAS(holdDetails) {
    const altitude = Simplane.getAltitude();
    if (holdDetails.holdSpeedType === HoldSpeedType.FAA) {
      if (altitude <= 6000) {
        return 200;
      }
      else if (altitude > 6000 && altitude <= 14000) {
        return 230;
      }
      else {
        return 265;
      }
    }
    else if (holdDetails.holdSpeedType === HoldSpeedType.ICAO) {
      if (altitude <= 14000) {
        return 230;
      }
      else if (altitude > 14000 && altitude <= 20000) {
        return 240;
      }
      else if (altitude > 20000 && altitude <= 34000) {
        return 265;
      }
      else {
        return 280;
      }
    }
  }

  /**
   * Calculates the estimated time enroute to the specified waypoint index for the hold.
   * @param {number} index The waypoint index of the hold.
   * @returns {number} The estimated time enroute to the hold, in seconds. 
   */
  calculateETE(index) {
    const activeWaypointIndex = this._fmc.flightPlanManager.getActiveWaypointIndex() - 1;
    const waypointsToHold = this._fmc.flightPlanManager.getAllWaypoints()
      .slice(activeWaypointIndex, index - activeWaypointIndex);
    
    const planePosition = CJ4_FMC_HoldsPage.getPlanePosition();
    const groundSpeed = Simplane.getGroundSpeed();
    let distanceToHold = 0;

    for (var i = 0; i < waypointsToHold.length; i++) {
      if (i === 0) {
        distanceToHold += Avionics.Utils.computeGreatCircleDistance(planePosition, waypointsToHold[i].infos.coordinates);
      }
      else {
        distanceToHold += Avionics.Utils.computeGreatCircleDistance(waypointsToHold[i - 1].infos.coordinates, waypointsToHold[i].infos.coordinates);
      }
    }

    return Math.round(distanceToHold / (groundSpeed / 3600));
  }

  /**
   * Gets the current plane position
   * @returns {LatLongAlt} The current plane position.
   */
  static getPlanePosition() {
    return new LatLongAlt(SimVar.GetSimVarValue("GPS POSITION LAT", "degree latitude"), SimVar.GetSimVarValue("GPS POSITION LON", "degree longitude"));
  }

  /**
   * Gets the holds defined in the flight plan.
   * @param {CJ4_FMC} fmc The FMC to use to look up the holds.
   * @returns {{waypoint: WayPoint, index: number}[]} A collection of waypoints that have holds defined.
   */
  static getFlightplanHolds(fmc) {
    const fromWaypointIndex = fmc.flightPlanManager.getActiveWaypointIndex() - 1;
    return fmc.flightPlanManager.getAllWaypoints()
      .map((waypoint, index) => ({waypoint, index}))
      .slice(fromWaypointIndex)
      .filter(x => x.waypoint.hasHold);
  }

  /**
   * Gets a string for the given entry type.
   * @param {HoldEntry} entryType The entry type.
   * @returns {string} The string for the entry type. 
   */
  static getEntryTypeString(entryType) {
    switch (entryType) {
      case HoldEntry.Direct:
        return 'DIRECT';
      case HoldEntry.Parallel:
        return 'PARALL';
      case HoldEntry.Teardrop:
        return 'TEARDP';
    }
  }

  /**
   * Shows the FPLN HOLD page optionally for the specified ident.
   * @param {CJ4_FMC} fmc The instance of the FMC to use.
   * @param {string} ident The ident to show. 
   */
  static showHoldPage(fmc, ident) {
    const instance = new CJ4_FMC_HoldsPage(fmc);
    const holds = CJ4_FMC_HoldsPage.getFlightplanHolds(fmc);

    const holdPageIndex = holds.findIndex(x => x.waypoint.ident === ident);
    if (holdPageIndex !== -1) {
      instance._state.pageNumber = holdPageIndex + 1;
      instance._state.page = CJ4_FMC_HoldsPage.FPLN_HOLD;
    }

    instance._state.isModifying = fmc._fpHasChanged;
    CJ4_FMC_HoldsPage.Instance = instance;

    instance.update();
  }

  /**
   * Shows the HOLD LIST page.
   * @param {CJ4_FMC} fmc The instance of the FMC to use.
   */
  static showHoldList(fmc) {
    const instance = new CJ4_FMC_HoldsPage(fmc);

    instance._state.page = CJ4_FMC_HoldsPage.HOLD_LIST;
    instance._state.isModifying = fmc._fpHasChanged;
    CJ4_FMC_HoldsPage.Instance = instance;

    instance.update();
  }

  /**
   * Handles when HOLD is pressed from the IDX page.
   * @param {CJ4_FMC} fmc The instance of the FMC to use. 
   */
  static handleHoldPressed(fmc) {
    const holds = CJ4_FMC_HoldsPage.getFlightplanHolds(fmc);

    if (holds.length === 0) {
      CJ4_FMC_LegsPage.ShowPage1(fmc, true);
    }
    else if (holds.length === 1) {
      CJ4_FMC_HoldsPage.showHoldPage(fmc);
    }
    else if (holds.length > 1) {
      CJ4_FMC_HoldsPage.showHoldList(fmc);
    }
  }
}

CJ4_FMC_HoldsPage.Instance = undefined;

CJ4_FMC_HoldsPage.FPLN_HOLD = 'FPLN HOLD';
CJ4_FMC_HoldsPage.HOLD_LIST = 'HOLD LIST';

CJ4_FMC_HoldsPage.NONE = 'NONE';
CJ4_FMC_HoldsPage.ADD = 'ADD';
CJ4_FMC_HoldsPage.CHANGE_EXISTING= 'CHANGE_EXISTING';