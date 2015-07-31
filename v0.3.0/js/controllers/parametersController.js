app.controller("parametersController", function($scope, sharedScope) {
    $scope.data = sharedScope.data;
    /*
     *  Concepts:
     *  level               A level is a point in the tree master > glyph > penstroke > point
     *                      you can go up a level by element.findParentElement() and have an array with its children by element.children
     *  element             Is the name for an object in any level
     *  parameter           eg Weight, Width, etc
     *  -   effectiveLevel  Each parameter is effective at a certain level. Eg. Weight is effective on point level and width on glyph level
     *  operator            eg '+', '-', etc
     *  -   step            Users can manipulate values with arrow up and arrow down. For each parameter this step is specified
     *  -   decimals        An input value can have a number of decimals, by eather user input or by recalculation. For each parameter the number of decimals is specified
     *  -   effectiveLocal  Some operators influence their own level cpsFactor: eg `x`,  others only influence the cpsFactor at a deeper level
     *  range               When a selection of elements has different values for a specific operator+parameter. The range are the outer values of the
     *                      selection. All in between values are changed by ratio when the ranges changes.
     *  effictiveValue      This value is assigned at the effective level. Its the outcome of all inhereted operators
     *  cpsFactor           each level (higher or equal to the effective level) can have a cpsFactor. When nothing is assigned by the UI, the
     *                      standard value, which is in lib/parameters.cps applies. At a level higher then the effective level, the local 'x' and '÷' make
     *                      the cpsFactor. At the effective level it is the effectiveValue / (initialValue * ancestorCPSfactors);
     *  initialValue        Because ao width and height are not real csp properties, we can only inject a factor into cps. To influence the outcome,
     *                      we have to know the inital value of a parameter; this is measured at initiation.
     *
     *
     *
     */

    $scope.levels = ["master", "glyph", "penstroke", "point"];
    $scope.parameterSelection = {};

    $scope.addLevels = function() {
        angular.forEach($scope.levels, function(level) {
            $scope.parameterSelection[level] = [];
        });
    };
    $scope.addLevels();

    /*
     // until #392 is fixed, we work only with width and weight

     $scope.parameters = [{
     name : "Weight",
     cpsKey : "WeightF",
     unit : "em",
     step : 0.1,
     decimals : 2,
     effectiveLevel : 3
     }, {
     name : "Width",
     unit : "em",
     step : 0.005,
     decimals : 4,
     effectiveLevel : "glyph"
     }, {
     name : "Height",
     unit : "em",
     step : 0.02,
     decimals : 3,
     effectiveLevel : "glyph"
     }, {
     name : "Spacing",
     unit : "em",
     step : 1,
     decimals : 1,
     effectiveLevel : "glyph"
     }];
     */

    $scope.parameters = [{
        name : "Width",
        cpsKey : "WidthF",
        unit : "em",
        step : 0.005,
        decimals : 4,
        effectiveLevel : 1,
        getInitial : function(element) {
            // temp hack untill #392 is fixed
            return element._advanceWidth;
        }
    }, {
        name : "Weight",
        cpsKey : "WeightF",
        unit : "em",
        step : 0.1,
        decimals : 2,
        effectiveLevel : 3,
        getInitial : function(element) {
            return element.right.getComputedStyle().get("onLength");
        }
    }];

    $scope.operators = [{
        name : "x",
        standardValue : 1,
        type : "stack",
        usesUnit : false,
        effectiveLocal : true
    }, {
        name : "÷",
        standardValue : 1,
        type : "stack",
        usesUnit : false,
        effectiveLocal : true
    }, {
        name : "+",
        standardValue : 0,
        type : "stack",
        usesUnit : true,
        effectiveLocal : false
    }, {
        name : "-",
        standardValue : 0,
        type : "stack",
        usesUnit : true,
        effectiveLocal : false
    }, {
        name : "=",
        standardValue : null,
        type : "unique",
        usesUnit : true,
        effectiveLocal : false
    }, {
        name : "effectiveValue", // todo find another place for the effective value. That way, we don't have to another updateSelectionParameters() (which makes the input fields lose their focus) to presents its value
        usesUnit : true,
    }];

    /***
     Measurement functions
     ***/

    $scope.data.measureInitialForGlyph = function(glyph) {
        //  loop through all parameters
        angular.forEach($scope.parameters, function(parameter) {
            // find the effective children of the glyph depending on effective level of the parameter
            var elements = $scope.getElementsByLevel(glyph, parameter.effectiveLevel, 1);
            angular.forEach(elements, function(element) {
                angular.forEach(element.parameters, function(thisParameter) {
                    if (thisParameter.name == parameter.name) {
                        if (!thisParameter.initial) {
                            var value = parameter.getInitial(element.apiReference);
                            thisParameter.initial = value;
                            thisParameter.effective = value;
                        }
                    }
                });
            });
        });
        glyph.rendered = true;
    };

    $scope.measureInitialForElement = function(element, thisParameter) {
        var value = $scope.getParameterByName(thisParameter.name).getInitial(element.apiReference);
        thisParameter.initial = value;
    };
    
    $scope.data.checkBaseMaster = function(instanceName, glyphName) {
        var instance = $scope.data.getInstanceByName(instanceName);
        angular.forEach(instance.axes, function(axis) {
            var glyph = $scope.data.getGlyphByMasterAndGlyphName(glyphName, axis.masterName);
            if (!glyph.rendered) {
                $scope.updateCPSforGlyph(glyph);
            }
        });
    };
    
    $scope.data.checkBaseMastersBeforeExport = function(instance) {
        angular.forEach(instance.axes, function(axis) {
            var master = $scope.data.findMaster(axis.masterName);
            angular.forEach(master.children, function(glyph) {
                if (!glyph.rendered) {
                    console.log(glyph);
                    $scope.updateCPSforGlyph(glyph);
                }
            });
        });
    };

    /***
     Parameters selection functions
     ***/

    $scope.data.updateSelectionParameters = function(selectionChanged) {
        if (selectionChanged) {
            $scope.destackOperators();
        }
        angular.forEach($scope.levels, function(level) {
            $scope.parameterSelection[level] = $scope.updateSelectionParametersElements(level);
            $scope.updateEffectiveValueElements(level);
        });
    };

    $scope.updateEffectiveValueForAllLevels = function() {
        angular.forEach($scope.levels, function(level) {
            $scope.updateEffectiveValueElements(level);
        });
    };

    $scope.updateSelectionParametersElements = function(level) {
        var selectionParameters = [];
        // get all the elements - depending on the level we are in - with edit == true
        var elements = $scope.findElementsEdit(level);
        angular.forEach($scope.parameters, function(theParameter) {
            var theOperators = [];
            var hasThisParameter = false;
            angular.forEach($scope.operators, function(theOperator, operatorIndex) {
                var hasThisOperator = false;
                var nrOfElements = 0;
                var nrOfHasOperator = 0;
                var lowest = null;
                var highest = null;
                angular.forEach(elements, function(element, index) {
                    nrOfElements++;
                    angular.forEach(element.parameters, function(elementParameter) {
                        if (elementParameter.name == theParameter.name) {
                            hasThisParameter = true;
                            angular.forEach(elementParameter.operators, function(operator) {
                                if (operator.name == theOperator.name) {
                                    if (!operator.id) {
                                        // an operator without id is a de-stacked operator
                                        hasThisOperator = true;
                                        nrOfHasOperator++;
                                        if (operator.value < lowest || lowest == null) {
                                            lowest = operator.value;
                                        }
                                        if (operator.value > highest || highest == null) {
                                            highest = operator.value;
                                        }
                                    } else {
                                        // an operator with an id is a stacked operator
                                        // added during the current selection process.
                                        // the id will be removed after deselecting + de-stacking
                                        // range is always false, because it is added after selecting
                                        // only at index == 0, because this counts for all elements the same
                                        if (index == 0) {
                                            theOperators.push({
                                                name : operator.name,
                                                range : false,
                                                low : {
                                                    current : operator.value,
                                                    fallback : operator.value
                                                },
                                                id : operator.id
                                            });
                                        }
                                    }
                                }
                            });
                        }
                    });
                });
                // when a multiple selection contains one object with a setting and another without
                // the standard value is used
                if (nrOfElements > nrOfHasOperator && nrOfHasOperator > 0) {
                    if (theOperator.standardValue < lowest) {
                        lowest = theOperator.standardValue;
                    }
                    if (theOperator.standardValue > highest) {
                        highest = theOperator.standardValue;
                    }
                }
                // if the values within a selection differ, we are having a range
                var range = true;
                if (lowest == highest) {
                    range = false;
                }

                if (hasThisOperator) {
                    theOperators.push({
                        name : theOperator.name,
                        range : range,
                        low : {
                            current : lowest,
                            fallback : lowest
                        },
                        high : {
                            current : highest,
                            fallback : highest
                        }
                    });
                }
            });
            if (hasThisParameter) {
                selectionParameters.push({
                    name : theParameter.name,
                    operators : theOperators,
                    hasContent : 1
                });
            } else {
                selectionParameters.push({
                    name : theParameter.name,
                    hasContent : 0
                });
            }
        });
        return selectionParameters;
    };

    // todo: combine this function more with $scope.updateSelectionParametersElements, so the selectionmaker doesn't have to run
    // twice through the elements. The updating of the effective values has to be able to be called seperatly, otherwise when updated
    // the focus of the inputs will be lost if we always combine it with updating the parameters selection
    // or when a new parameter+operator is added, just push it to the selection parameters.
    $scope.updateEffectiveValueElements = function(level) {
        var effectiveValuesThisLevel = [];
        // get all the elements - depending on the level we are in - with edit == true
        var elements = $scope.findElementsEdit(level);
        angular.forEach($scope.parameters, function(theParameter) {
            var effectiveLevel = theParameter.effectiveLevel;
            // there are only effective values to find at the effective level of this parameter
            if ($scope.getLevelIndex(level) == effectiveLevel) {
                var hasThisParameter = false;
                var lowest = null;
                var highest = null;
                angular.forEach(elements, function(element, index) {
                    angular.forEach(element.parameters, function(elementParameter) {
                        if (elementParameter.name == theParameter.name) {
                            hasThisParameter = true;
                            if (elementParameter.effective) {
                                var elementValue = elementParameter.effective;
                                if (elementValue < lowest || lowest == null) {
                                    lowest = elementValue;
                                }
                                if (elementValue > highest || highest == null) {
                                    highest = elementValue;
                                }
                            }
                        }
                    });
                });
                // if the values within a selection differ, we are having a range
                var range = true;
                if (lowest == highest) {
                    range = false;
                }
                var thisEffectiveValue = {
                    name : "effective",
                    range : range,
                    low : lowest,
                    high : highest
                };
                // insert the effective values into the parameters selection
                if (hasThisParameter) {
                    angular.forEach($scope.parameterSelection[level], function(parameterOfSelection) {
                        if (parameterOfSelection.name == theParameter.name) {
                            parameterOfSelection.effective = thisEffectiveValue;
                            parameterOfSelection.hasContent++;
                        }
                    });
                }
            }
        });
    };

    /***
     Value change functions
     ***/

    $scope.changeValue = function(parameterName, operator, value, level, range, keyEvent) {
        if (keyEvent == "blur" || keyEvent.keyCode == 13 || keyEvent.keyCode == 38 || keyEvent.keyCode == 40) {
            var operatorName = operator.name;
            var thisValue = $scope.managedInputValue(value, parameterName, operatorName, keyEvent);
            var operatorId = operator.id;
            value.current = thisValue;
            value.fallback = thisValue;

            // find which elements (master(s) or glyph(s) - later also deeper levels - to edit with this value
            var elements = $scope.findElementsEdit(level);
            angular.forEach(elements, function(element) {
                // if there is a range, we have to find the value for this element within the range
                if (range) {
                    thisValue = $scope.getRangeValue(element, parameterName, operator, level);
                }
                var elementsMaster = $scope.findMasterByElement(element);
                $scope.setParameterModel(elementsMaster, element, parameterName, operatorName, thisValue, operatorId);
                $scope.checkEffectiveValueEffects(element, level, parameterName, operator);
                $scope.updateEffectiveValueForAllLevels();
            });
            if (range) {
                // update the range boundaries after setting each element,
                // so the new value of a (inbetween range) element
                // gets the right myPosition relative to the new boundaries
                operator.low.old = operator.low.current;
                operator.high.old = operator.high.current;
            }
        }
    };

    $scope.setParameterModel = function(master, element, parameterName, operatorName, value, operatorId) {
        var theParameter = null;
        var theOperator = null;
        angular.forEach(element.parameters, function(parameter) {
            if (parameter.name == parameterName) {
                theParameter = parameter;
                angular.forEach(parameter.operators, function(operator) {
                    if ((operator.name == operatorName) && ((operator.id == operatorId) || (!operator.id && !operatorId))) {
                        theOperator = operator;
                    }
                });
            }
        });
        // in ranges situation can appear where an element doesn't have the parameter or the operator already
        if (!theOperator) {
            // create operator
            var newOperator = $scope.getOperatorByName(operatorName);
            newOperator.value = parseFloat(value);
            if (!theParameter) {
                // create parameter
                var newParameter = $scope.getParameterByName(parameterName);
                newParameter.operators = [];
                newParameter.operators.push(newOperator);
                element.parameters.push(newParameter);
            } else {
                theParameter.operators.push(newOperator);
            }
        } else {
            theOperator.value = parseFloat(value);
        }
    };

    $scope.checkEffectiveValueEffects = function(element, level, parameterName, operator) {
        // check if this parameter is effecting this level or also deeper
        var effectiveLevel = $scope.getParameterByName(parameterName).effectiveLevel;
        var thisLevelIndex = $scope.getLevelIndex(level);

        // The operators 'x' and '÷' are effecting the cpsFactor at a local level
        // The other operators effect the cpsFactor at their effective level (eg width -> glyphlevel, weight -> pointlevel)
        var effectiveLocal = $scope.getOperatorByName(operator.name).effectiveLocal;
        if (effectiveLevel > thisLevelIndex) {
            // search for efficve level and effect the children on that level
            var levelElements = [element];
            var tempElements = [];
            while (thisLevelIndex < effectiveLevel) {
                thisLevelIndex++;
                angular.forEach(levelElements, function(levelElement) {
                    angular.forEach(levelElement.children, function(childElement) {
                        // for efficiency reasons we are only afffecting the glyphs which are (or were) visible (and therefor have been measured already)
                        if (thisLevelIndex == 1) {
                            if (childElement.rendered) {
                                tempElements.push(childElement);
                            }
                        } else {
                            tempElements.push(childElement);
                        }
                    });
                });
                levelElements = tempElements;
                tempElements = [];
            }
            angular.forEach(levelElements, function(thisElement) {
                angular.forEach(thisElement.parameters, function(parameter) {
                    if (parameter.name == parameterName) {
                        parameter.effective = $scope.updateEffectiveValue(thisElement, parameterName);
                    }
                });
                if (!effectiveLocal) {
                    $scope.updateCPSfactor(thisElement, parameterName);
                }
            });
        } else {
            // effect this level
            angular.forEach(element.parameters, function(parameter) {
                if (parameter.name == parameterName) {
                    angular.forEach(parameter.operators, function(operator) {
                        parameter.effective = $scope.updateEffectiveValue(element, parameterName);
                    });
                }
            });
        }
        if (effectiveLocal || effectiveLevel == thisLevelIndex) {
            $scope.updateCPSfactor(element, parameterName);
        }
    };

    $scope.updateEffectiveValue = function(element, parameterName) {
        var min, max, is, effectiveValue, plus = [], multiply = [], levelCounter = 0, initial;
        while (element.level != "sequence") {
            angular.forEach(element.parameters, function(parameter) {
                if (parameter.name == parameterName) {
                    if (levelCounter == 0) {
                        if (!parameter.initial) {
                            $scope.measureInitialForElement(element, parameter);
                        }
                        initial = parameter.initial;
                    }

                    angular.forEach(parameter.operators, function(operator) {
                        if (!plus[levelCounter]) {
                            plus[levelCounter] = [];
                        }
                        if (!multiply[levelCounter]) {
                            multiply[levelCounter] = [];
                        }
                        // the deepest level applies for these operators
                        if (operator.name == "min" && !min) {
                            min = operator.value;
                        } else if (operator.name == "max" && !max) {
                            max = operator.value;
                        } else if (operator.name == "=" && !is) {
                            is = operator.value;
                        } else if (operator.name == "+") {
                            plus[levelCounter].push(parseFloat(operator.value));
                        } else if (operator.name == "-") {
                            plus[levelCounter].push(parseFloat(-operator.value));
                        } else if (operator.name == "x") {
                            multiply[levelCounter].push(parseFloat(operator.value));
                        } else if (operator.name == "÷") {
                            multiply[levelCounter].push(parseFloat(1 / operator.value));
                        }
                    });
                }
            });
            levelCounter++;
            element = $scope.findParentElement(element);
        }
        if (is) {
            effectiveValue = is;
        } else {
            effectiveValue = initial;
        }
        angular.forEach(multiply, function(multiplyLevelSet) {
            angular.forEach(multiplyLevelSet, function(multiplier) {
                effectiveValue *= multiplier;
            });
        });
        angular.forEach(plus, function(plusLevelSet) {
            angular.forEach(plusLevelSet, function(plusser) {
                effectiveValue += plusser;
            });
        });

        if (effectiveValue > max) {
            effectiveValue = max;
        } else if (effectiveValue < min) {
            effectiveValue = min;
        }
        return effectiveValue;
    };
    
    /***
     CPS functions
     ***/

    $scope.updateCPSfactor = function(element, parameterName) {
        var multiply = [], cpsFactor = 1, master;
        var thisLevelIndex = $scope.getLevelIndex(element.level);
        var theParameter = $scope.getParameterByName(parameterName);
        var targetLevel = theParameter.effectiveLevel;
        // if we are editing parameter values at the level where the parameter is effective
        // then check for all inhereted parameters ('+', '-', 'min', 'max', '=')
        // else only use local 'x' and '÷'
        if (thisLevelIndex == targetLevel) {
            // to find the local cpsFactor
            // we need to divide the effectiveValue by the initial value and by all parent cpsFactors
            // all the effiveValues are updated at this time by $scope.updateEffectiveValue()
            var effeciveValue, initialValue;
            var parentCPSfactor = $scope.findParentCPSfactor(element, parameterName);
            angular.forEach(element.parameters, function(parameter) {
                if (parameter.name == parameterName) {
                    effeciveValue = parameter.effective;
                    initialValue = parameter.initial;
                    cpsFactor = effeciveValue / (initialValue * parentCPSfactor);
                    parameter.cpsFactor = cpsFactor;
                }
            });
            master = $scope.findMasterByElement(element);
            // check if this element has its own rule already
            if (!element.ruleIndex) {
                $scope.addRullAPI(master, element);
            }
            $scope.setParameterAPI(master, element.ruleIndex, theParameter.cpsKey, cpsFactor);

        } else {
            // we are at a higher level then target level. Eg: at masterlevel when editing width (targetlevel for width is glyph)
            // in this level only the local 'x' and '÷' matter
            // futurewise we could also check if we are at a deeper level than target. This can't have effect, so we should give a warning

            angular.forEach(element.parameters, function(parameter) {
                if (parameter.name == parameterName) {
                    angular.forEach(parameter.operators, function(operator) {
                        if (operator.name == "x") {
                            multiply.push(parseFloat(operator.value));
                        } else if (operator.name == "÷") {
                            multiply.push(parseFloat(1 / operator.value));
                        }
                    });
                    angular.forEach(multiply, function(mtply) {
                        cpsFactor *= mtply;
                    });
                    parameter.cpsFactor = cpsFactor;
                    if (element.level == "master") {
                        master = element;
                    } else {
                        master = $scope.findMasterByElement(element);
                    }
                    // check if this element has its own rule already
                    if (!element.ruleIndex) {
                        $scope.addRullAPI(master, element);
                    }
                    $scope.setParameterAPI(master, element.ruleIndex, theParameter.cpsKey, cpsFactor);
                }
            });
        }
    };

    $scope.findParentCPSfactor = function(element, parameterName) {
        var ancestorCPSfactor = 1;
        while (element.level != "master") {
            element = $scope.findParentElement(element);
            angular.forEach(element.parameters, function(parameter) {
                if (parameter.name == parameterName && parameter.cpsFactor) {
                    ancestorCPSfactor *= parameter.cpsFactor;
                }
            });

        }
        return ancestorCPSfactor;
    };
    
    // this functions checks if this glyph needs to add rules (on glyph, stroke or point level)
    // because it wasn't rendered before by the parameters-specimen, but now a metapolation master is using this glyph
    $scope.updateCPSforGlyph = function(glyph) {
        var measured = false;
        var elements = [glyph.parent];
        var level = 0;
        var inheritance = {};
        var tempElements = [];
        // go down the element tree from master to point
        while (level < 4) {
            angular.forEach(elements, function(element) {
                angular.forEach(element.parameters, function(parameter) {
                    var thisParameterLevel = $scope.getParameterByName(parameter.name).effectiveLevel;
                    angular.forEach(parameter.operators, function(operator) {
                        var thisOperator = $scope.getOperatorByName(operator.name);
                        // check if the used operator is a `+` or etc. If so, it causes inheritance
                        if (!thisOperator.effectiveLocal) {
                            inheritance[parameter.name] = true;
                        }
                    });
                    // if the parameter has inheritance and we are at the effective level of the parameter, then update the elements cps
                    if (inheritance[parameter.name] && thisParameterLevel == level) {
                        if (!measured) {
                            // set initial values
                            $scope.data.measureInitialForGlyph(glyph);
                            glyph.rendered = true;
                        }
                        // update effective
                        parameter.effective = $scope.updateEffectiveValue(element, parameter.name);
                        $scope.updateCPSfactor(element, parameter.name);
                    }
                });
                if (level == 0) {
                    // when we go down the tree we only want to take the glyph we are looking at
                    tempElements.push(glyph);
                } else {
                    angular.forEach(element.children, function(child) {
                        tempElements.push(child);
                    });
                }
            });
            elements = tempElements;
            tempElements = [];
            level++;
        }
    };

    /***
     API functions
     ***/

    $scope.addRullAPI = function(master, element) {
        if ($scope.data.pill != "blue") {
            var parameterCollection = $scope.data.stateful.project.ruleController.getRule(false, master.cpsFile);
            var l = parameterCollection.length;
            var selectorListString = $scope.constructSelectorString(element);
            var ruleIndex = $scope.data.stateless.cpsAPITools.addNewRule(parameterCollection, l, selectorListString);
            element.ruleIndex = ruleIndex;
        }
    };

    $scope.constructSelectorString = function(element) {
        // todo: reconstruct to remove the hardcoded ifs
        var level = element.level, string;
        if (level == "master") {
            string = level + "#" + element.name;
        } else if (level == "glyph") {
            string = level + "#" + element.name;
        } else if (level == "penstroke") {
            glyph = $scope.findParentElement(element);
            string = glyph.level + "#" + glyph.name + " > " + element.name;
        } else if (level == "point") {
            penstroke = $scope.findParentElement(element);
            glyph = $scope.findParentElement(penstroke);
            string = glyph.level + "#" + glyph.name + " > " + penstroke.name + " > " + element.name + " > right";
        }
        return string;
    };

    $scope.setParameterAPI = function(master, ruleIndex, cpsKey, value) {
        if ($scope.data.pill != "blue") {
            var parameterCollection = $scope.data.stateful.project.ruleController.getRule(false, master.cpsFile);
            var cpsRule = parameterCollection.getItem(ruleIndex);
            var parameterDict = cpsRule.parameters;
            var setParameter = $scope.data.stateless.cpsAPITools.setParameter;
            setParameter(parameterDict, cpsKey, value);
            console.log(parameterCollection.toString());
        }
    };

    /***
     Efficiency functions
     ***/

    $scope.reorderOperators = function(operators) {
        var temp = [], newOperators = [];
        angular.forEach(operators, function(operator) {
            angular.forEach($scope.operators, function(theOperator, index) {
                if (operator.name == theOperator.name) {
                    if (!temp[index]) {
                        temp[index] = [];
                    }
                    temp[index].push(operator);
                }
            });
        });
        angular.forEach(temp, function(tempset) {
            if (tempset.length > 0) {
                newOperators = newOperators.concat(tempset);
            }

        });
        return newOperators;
    };

    $scope.destackOperators = function() {
        var elements = $scope.findAllElements();
        angular.forEach(elements, function(element) {
            angular.forEach(element.parameters, function(parameter) {
                var lastOperator = {
                    name : null,
                    value : null
                };
                var newSetOperators = [];
                var newOperator;
                var changeOfOperator;
                if (parameter.operators.length > 0) {
                    angular.forEach(parameter.operators, function(operator, index) {
                        // reset the id of the operator. So later we know that operators without id are destacked
                        operator.id = null;
                        // to do: check if operator type is 'stack'.
                        // This matters when non-stack operators (like =) are added
                        if (operator.name == lastOperator.name) {
                            if (operator.name == "+" || operator.name == "-") {
                                newOperator.value = parseFloat(newOperator.value) + parseFloat(operator.value);
                            } else if (operator.name == "x" || operator.name == "÷") {
                                newOperator.value = parseFloat(newOperator.value) * parseFloat(operator.value);
                            }
                        } else {
                            if (index != 0) {
                                newSetOperators.push(newOperator);
                            }
                            newOperator = operator;
                        }
                        lastOperator = operator;

                    });
                    newSetOperators.push(newOperator);
                    parameter.operators = newSetOperators;
                }
            });
        });
    };

    /***
     Handling the parameter add panel
     ***/

    $scope.parameterLevel = null;
    $scope.panelParameter = null;
    $scope.panelOperator = null;
    // to keep track of an added operator, an id is added to it,
    // because an element could have multiple of the same parameter+instance
    // when te selection is lost, and de-stacking the operatorers, the id is removed.
    // prevent use of 0, because that will match undefined
    $scope.operatorId = 1;
    $scope.parameterId = 1;

    $scope.addParameterToPanel = function(parameter) {
        $scope.panelParameter = parameter;
        if ($scope.panelParameter && $scope.panelOperator) {
            $scope.addParameterToElements($scope.panelParameter, $scope.panelOperator);
        }
    };

    $scope.addOperatorToPanel = function(operator) {
        $scope.panelOperator = operator;
        if ($scope.panelParameter && $scope.panelOperator) {
            $scope.addParameterToElements($scope.panelParameter, $scope.panelOperator);
        }
    };

    $scope.addParameterToElements = function(parameter, operator) {
        // get all the elements - depending on the level we are in - with edit == true
        var level = $scope.parameterLevel;
        var elements = $scope.findElementsEdit(level);
        angular.forEach(elements, function(element) {
            var hasRule = false;
            if (element.parameters.length > 0) {
                hasRule = true;
            }
            var hasParameter = false;
            angular.forEach(element.parameters, function(thisParameter) {
                if (thisParameter.name == parameter.name) {
                    hasParameter = true;
                    thisParameter.operators.push({
                        name : operator.name,
                        value : operator.standardValue,
                        id : $scope.operatorId
                    });
                    thisParameter.operators = $scope.reorderOperators(thisParameter.operators);
                }
            });
            if (!hasParameter) {
                element.parameters.push({
                    name : parameter.name,
                    id : $scope.parameterId,
                    operators : [{
                        name : operator.name,
                        value : operator.standardValue,
                        id : $scope.operatorId
                    }]
                });
                $scope.parameterId++;
            }
        });
        $scope.operatorId++;
        $scope.data.view.parameterOperatorPanel = 0;
        $scope.data.updateSelectionParameters(false);
    };

    $scope.parametersWindow = function(event, target, level) {
        $scope.parameterLevel = level;
        $scope.panelOperator = null;
        $scope.panelParameter = null;
        var top = $(event.target).offset().top + 20;
        var left = $(event.target).offset().left + 20;
        $scope.parameterPanelTop = top;
        $scope.parameterPanelLeft = left;
        if (target != $scope.data.view.parameterOperatorPanel) {
            $scope.data.view.parameterOperatorPanel = target;
        } else {
            $scope.data.view.parameterOperatorPanel = 0;
        }
    };

    $scope.areElementsSelected = function(level) {
        // todo: make this flexibel for the levels, fix the hardcoded if
        var selected = false;
        if (level == "master") {
            angular.forEach($scope.data.sequences, function(sequence) {
                angular.forEach(sequence.masters, function(master) {
                    if (master.edit[0]) {
                        selected = true;
                    }
                });
            });
        } else if (level == "glyph") {
            angular.forEach($scope.data.sequences, function(sequence) {
                angular.forEach(sequence.masters, function(master) {
                    if (master.edit[0]) {
                        angular.forEach(master.children, function(glyph) {
                            if (glyph.edit) {
                                selected = true;
                            }
                        });
                    }
                });
            });
        } else if (level == "penstroke") {
            angular.forEach($scope.data.sequences, function(sequence) {
                angular.forEach(sequence.masters, function(master) {
                    if (master.edit[0]) {
                        angular.forEach(master.children, function(glyph) {
                            if (glyph.edit) {
                                selected = true;
                            }
                        });
                    }
                });
            });
        } else if (level == "point") {
            angular.forEach($scope.data.sequences, function(sequence) {
                angular.forEach(sequence.masters, function(master) {
                    if (master.edit[0]) {
                        angular.forEach(master.children, function(glyph) {
                            if (glyph.edit) {
                                selected = true;
                            }
                        });
                    }
                });
            });
        }
        return selected;
    };

    $scope.openParameterPanel = function(parameter, event, level) {
        $scope.data.closeParameterPanel();
        var target = event.currentTarget;
        $(target).addClass("selected-parameter");
        var targetLeft = event.clientX;
        var targetTop = event.clientY;
        $scope.data.view.parameterPanel.display = true;
        $scope.data.view.parameterPanel.left = targetLeft;
        $scope.data.view.parameterPanel.top = targetTop;
        $scope.data.view.parameterPanel.level = level;
        $scope.data.view.parameterPanel.selected = parameter.name;
    };

    $scope.changeParameter = function(parameter) {
        /*
         var oldParameterName = $scope.data.view.parameterPanel.selected;
         if (oldParameterName != parameter.name) {
         var elements = $scope.findElementsEdit($scope.data.view.parameterPanel.level);
         angular.forEach(elements, function(element) {
         angular.forEach(element.parameters, function(thisParameter) {
         if (thisParameter.name == oldParameterName) {
         thisParameter.name = parameter.name;
         }
         });
         });
         }
         $scope.data.updateSelectionParameters(false);
         $scope.data.closeParameterPanel();
         */
    };

    $scope.removeParameter = function() {
        /*
         var oldParameterName = $scope.data.view.parameterPanel.selected;
         var elements = $scope.findElementsEdit($scope.data.view.parameterPanel.level);
         angular.forEach(elements, function(element) {
         var parameters = element.parameters;
         angular.forEach(parameters, function(thisParameter) {
         if (thisParameter.name == oldParameterName) {
         parameters.splice(parameters.indexOf(thisParameter), 1);
         }
         if (parameters.length == 0) {
         // todo: remove rule in api and in model
         }
         });
         });
         $scope.data.updateSelectionParameters(false);
         $scope.data.closeParameterPanel();
         */
    };

    $scope.data.closeParameterPanel = function() {
        $scope.data.view.parameterPanel.display = false;
        $scope.data.view.parameterPanel.selected = null;
        $scope.data.view.parameterPanel.level = null;
        $("parameters .parameter-key").each(function() {
            $(this).removeClass("selected-parameter");
        });
    };

    $scope.openOperatorPanel = function(parameter, operator, event, level) {
        $scope.data.closeOperatorPanel();
        var target = event.currentTarget;
        $(target).addClass("selected-parameter");
        var targetLeft = event.clientX;
        var targetTop = event.clientY;
        $scope.data.view.operatorPanel.display = true;
        $scope.data.view.operatorPanel.left = targetLeft;
        $scope.data.view.operatorPanel.top = targetTop;
        $scope.data.view.operatorPanel.level = level;
        $scope.data.view.operatorPanel.selectedParameter = parameter.name;
        $scope.data.view.operatorPanel.selected = operator.name;
    };

    $scope.changeOperator = function(operator) {
        /*
         var oldParameterName = $scope.data.view.operatorPanel.selectedParameter;
         var oldOperatorName = $scope.data.view.operatorPanel.selected;
         if (oldOperatorName != operator.name) {
         var elements = $scope.findElementsEdit($scope.data.view.operatorPanel.level);
         angular.forEach(elements, function(element) {
         angular.forEach(element.parameters, function(thisParameter) {
         if (thisParameter.name == oldParameterName) {
         angular.forEach(thisParameter.operators, function(thisOperator) {
         if (thisOperator.name == oldOperatorName) {
         thisOperator.name = operator.name;
         }
         });
         }
         });
         });
         }
         $scope.data.updateSelectionParameters(false);
         $scope.data.closeOperatorPanel();
         */
    };

    $scope.removeOperator = function() {
        /*
         var oldParameterName = $scope.data.view.operatorPanel.selectedParameter;
         var oldOperatorName = $scope.data.view.operatorPanel.selected;
         var elements = $scope.findElementsEdit($scope.data.view.operatorPanel.level);
         angular.forEach(elements, function(element) {
         var parameters = element.parameters;
         angular.forEach(parameters, function(thisParameter) {
         if (thisParameter.name == oldParameterName) {
         angular.forEach(thisParameter.operators, function(thisOperator) {
         var thisOperators = thisParameter.operators;
         if (thisOperator.name == oldOperatorName) {
         // todo: change by API
         thisOperators.splice(thisOperators.indexOf(thisOperator), 1);
         }
         if (thisOperators.length == 0) {
         parameters.splice(parameters.indexOf(thisParameter), 1);
         // todo: remove rule in api and in model
         }
         });
         }
         });
         $scope.checkEffectiveValueEffects(element, element.level, oldParameterName, XXXOPERATOR);
         // todo check if we need the operator here
         });
         $scope.data.updateSelectionParameters(false);
         $scope.data.closeOperatorPanel();
         */
    };

    $scope.data.closeOperatorPanel = function() {
        $scope.data.view.operatorPanel.display = false;
        $scope.data.view.operatorPanel.selectedParameter = null;
        $scope.data.view.operatorPanel.selected = null;
        $scope.data.view.operatorPanel.level = null;
        $("parameters .parameter-operator").each(function() {
            $(this).removeClass("selected-parameter");
        });
    };

    $scope.showOperator = function(thisOperator) {
        var display = true, hasThisOperator = false;
        var level = $scope.data.view.operatorPanel.level;
        var parameterName = $scope.data.view.operatorPanel.selectedParameter;
        angular.forEach($scope.parameterSelection[level], function(parameter) {
            if (parameter.name == parameterName) {
                angular.forEach(parameter.operators, function(operator) {
                    if (operator.name == thisOperator.name) {
                        hasThisOperator = true;
                    }
                });
            }
        });
        if (thisOperator.name != $scope.data.view.operatorPanel.selected && thisOperator.type == "unique" && hasThisOperator) {
            display = false;
        }
        return display;
    };
    
    /***
     Helper functions
     ***/

    $scope.findElementsEdit = function(level) {
        // todo: make this flexibel for the levels, fix the hardcoded if
        var elements = [];
        if (level == "master") {
            angular.forEach($scope.data.sequences, function(sequence) {
                angular.forEach(sequence.masters, function(master) {
                    if (master.edit[0]) {
                        elements.push(master);
                    }
                });
            });
        } else if (level == "glyph") {
            angular.forEach($scope.data.sequences, function(sequence) {
                angular.forEach(sequence.masters, function(master) {
                    if (master.edit[0]) {
                        angular.forEach(master.children, function(glyph) {
                            if (glyph.edit) {
                                elements.push(glyph);
                            }
                        });
                    }
                });
            });
        } else if (level == "penstroke") {
            angular.forEach($scope.data.sequences, function(sequence) {
                angular.forEach(sequence.masters, function(master) {
                    if (master.edit[0]) {
                        angular.forEach(master.children, function(glyph) {
                            if (glyph.edit) {
                                angular.forEach(glyph.children, function(penstroke) {
                                    elements.push(penstroke);
                                });
                            }
                        });
                    }
                });
            });
        } else if (level == "point") {
            angular.forEach($scope.data.sequences, function(sequence) {
                angular.forEach(sequence.masters, function(master) {
                    if (master.edit[0]) {
                        angular.forEach(master.children, function(glyph) {
                            if (glyph.edit) {
                                angular.forEach(glyph.children, function(penstroke) {
                                    angular.forEach(penstroke.children, function(point) {
                                        elements.push(point);
                                    });
                                });
                            }
                        });
                    }
                });
            });
        }
        return elements;
    };

    $scope.findAllElements = function() {
        var elements = [];
        angular.forEach($scope.data.sequences, function(sequence) {
            angular.forEach(sequence.masters, function(master) {
                elements.push(master);
                angular.forEach(master.children, function(glyph) {
                    elements.push(glyph);
                });
            });
        });
        return elements;
    };

    function round(value, decimals) {
        return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
    }


    $scope.getParameterByName = function(parameterName) {
        var theParameter;
        angular.forEach($scope.parameters, function(parameter) {
            if (parameter.name == parameterName) {
                theParameter = parameter;
            }
        });
        return theParameter;
    };

    $scope.getOperatorByName = function(operatorName) {
        var theOperator;
        angular.forEach($scope.operators, function(operator) {
            if (operator.name == operatorName) {
                theOperator = operator;
            }
        });
        return theOperator;
    };

    $scope.findParentElement = function(element) {
        var parent = element.parent;
        return parent;
    };

    $scope.getLevelIndex = function(level) {
        var index;
        angular.forEach($scope.levels, function(thisLevel, thisIndex) {
            if (level == thisLevel) {
                index = thisIndex;
            }
        });
        return index;
    };

    $scope.findMasterByElement = function(element) {
        while (element.level != "master") {
            element = $scope.findParentElement(element);
        }
        return element;
    };

    $scope.data.getGlyphByMasterAndGlyphName = function(glyphName, masterName) {
        var thisGlyph;
        angular.forEach($scope.data.sequences[0].masters, function(master) {
            if (master.name == masterName) {
                angular.forEach(master.children, function(glyph) {
                    if (glyph.name == glyphName) {
                        thisGlyph = glyph;
                    }
                });
            }
        });
        return thisGlyph;
    };

    $scope.getElementsByLevel = function(glyph, effectiveLevel, thisLevelIndex) {
        var levelElements = [glyph];
        var tempElements = [];
        while (thisLevelIndex < effectiveLevel) {
            thisLevelIndex++;
            angular.forEach(levelElements, function(levelElement) {
                angular.forEach(levelElement.children, function(childElement) {
                    tempElements.push(childElement);
                });
            });
            levelElements = tempElements;
            tempElements = [];
        }
        return levelElements;
    };

    /***
     Input helper functions
     ***/

    $scope.getRangeValue = function(element, parameterName, myOperator, level) {
        var scale, myPosition, newValue;
        var decimals = $scope.getParameterByName(parameterName).decimals;
        var operatorName = myOperator.name;
        var oldLow = myOperator.low.old;
        var oldHigh = myOperator.high.old;
        var newLow = myOperator.low.current;
        var newHigh = myOperator.high.current;
        var currentValue = null;
        // find current value of the specific element
        angular.forEach(element.parameters, function(parameter) {
            if (parameter.name == parameterName) {
                angular.forEach(parameter.operators, function(operator) {
                    if (operator.name == operatorName) {
                        currentValue = operator.value;
                    }
                });
            }
        });
        if (currentValue == null) {
            currentValue = getOperatorByName(operatorName).standardValue;
        }
        if (oldLow == newLow && oldHigh == newHigh) {
            newValue = currentValue;
        } else {
            scale = oldHigh - oldLow;
            myPosition = (currentValue - oldLow) / scale;
            newValue = round(((newHigh - newLow) * myPosition + newLow), decimals);
        }
        return newValue;
    };

    $scope.managedInputValue = function(value, parameterName, operatorName, keyEvent) {
        var currentValue = value.current;
        // Not a number: use the fallback value.
        if (isNaN(currentValue) || currentValue === "") {
            currentValue = value.fallback;
        }
        if ( typeof (currentValue) == "string") {
            currentValue = parseFloat(currentValue.replace(',', '.'));
        }
        // Step size
        var thisParameter = $scope.getParameterByName(parameterName);
        var step = thisParameter.step;
        var decimals = thisParameter.decimals;
        if (keyEvent != "blur") {
            keyEvent.preventDefault();
            if (keyEvent.shiftKey) {
                step = step * 10;
            }
            if (keyEvent.keyCode == 38) {
                currentValue = round(parseFloat(currentValue) + step, decimals);
            } else if (keyEvent.keyCode == 40) {
                currentValue = round(parseFloat(currentValue) - step, decimals);
            }
        }
        return currentValue;
    };
});