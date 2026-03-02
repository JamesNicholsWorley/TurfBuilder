class UIManager {
    constructor(app) {
        this.app = app;
        this.statusTimeout = null;
        this.handleTurfClick = null;  // CHANGED: handleNeighborhoodClick → handleTurfClick
        this.debouncedFilterSearch = null;
        this.townSearchTimeout = null;
        
        this.bindEvents();
        this.setupDebouncedSearch();
        this.setupTownSearch();
    }

    bindEvents() {
        log('Binding events...');
        
        const loadButton = document.getElementById('loadParcels');
        
        if (!loadButton) {
            error('Missing load parcels button');
            return;
        }
        
        loadButton.addEventListener('click', () => {
            log('Load parcels button clicked');
            this.app.loadSelectedTowns();
        });
        
        log('Initial events bound successfully');
    }

    // NEW: Voter import methods
    showVoterImportDialog() {
        const importDiv = document.getElementById('voterImportDialog');
        if (!importDiv) return;
        
        importDiv.innerHTML = `
            <div class="voter-import-section">
                <h4>Import Voter Data</h4>
                <p>Link voters to loaded parcels using MASTER_ADDRESS_ID</p>
                
                <div class="import-method">
                    <label><strong>Method 1: Upload CSV File</strong></label>
                    <input type="file" id="voterCSVFile" accept=".csv" style="margin: 10px 0;">
                    <button onclick="app.uiManager.handleVoterCSVUpload()" class="btn btn-primary">Import CSV</button>
                </div>
                
                <div style="margin: 20px 0; text-align: center; color: #666;">— OR —</div>
                
                <div class="import-method">
                    <label><strong>Method 2: Google Sheets</strong></label>
                    <input type="text" id="googleSheetsURL" placeholder="Paste published Google Sheets URL..." style="width: 100%; margin: 10px 0; padding: 8px;">
                    <button onclick="app.uiManager.handleVoterGoogleSheets()" class="btn btn-primary">Import from Google Sheets</button>
                    <div style="font-size: 0.85em; color: #666; margin-top: 5px;">
                        Must be published to web as CSV (File → Share → Publish to web → CSV)
                    </div>
                </div>
                
                <button onclick="app.uiManager.cancelVoterImport()" class="btn btn-secondary" style="margin-top: 10px;">Cancel</button>
            </div>
        `;
    }

    async handleVoterCSVUpload() {
        const fileInput = document.getElementById('voterCSVFile');
        const file = fileInput?.files?.[0];
        
        if (!file) {
            this.showStatus('Please select a CSV file', 'error');
            return;
        }
        
        try {
            await this.app.importVoterData('csv', file);
            this.cancelVoterImport();
        } catch (err) {
            error('Error importing voter CSV:', err);
        }
    }

    async handleVoterGoogleSheets() {
        const urlInput = document.getElementById('googleSheetsURL');
        const url = urlInput?.value?.trim();
        
        if (!url) {
            this.showStatus('Please enter a Google Sheets URL', 'error');
            return;
        }
        
        try {
            await this.app.importVoterData('googlesheets', url);
            this.cancelVoterImport();
        } catch (err) {
            error('Error importing from Google Sheets:', err);
        }
    }

    cancelVoterImport() {
        const importDiv = document.getElementById('voterImportDialog');
        if (importDiv) {
            importDiv.innerHTML = '';
        }
    }

    // NEW: Voter sort control
    updateVoterSortOrder(sortBy) {
        this.app.voterSortBy = sortBy;

        // Re-render current parcel/cluster info
        if (this.app.clickedParcel) {
            const clusterKey = this.app.clustersByParcelId.get(this.app.clickedParcel.parcelId);
            const cluster = this.app.addressClusters.get(clusterKey);

            if (cluster && cluster.parcelIds.length > 1) {
                // Re-render cluster info
                this.showClusterInfo(cluster.parcelIds);
            } else {
                // Re-render single parcel info
                this.showParcelInfo(this.app.clickedParcel.parcelId, this.app.clickedParcel.feature);
            }
        }

        log('Voter sort order updated to:', sortBy);
    }

    // NEW: Debug fields toggle
    toggleDebugFields() {
        this.app.showDebugFields = !this.app.showDebugFields;
        
        // Update checkbox state
        const debugCheckbox = document.getElementById('debugFieldsToggle');
        if (debugCheckbox) {
            debugCheckbox.checked = this.app.showDebugFields;
        }
        
        // Refresh parcel info display
        if (this.app.clickedParcel) {
            this.showParcelInfo(this.app.clickedParcel.parcelId, this.app.clickedParcel.feature);
        }
        
        log('Debug fields:', this.app.showDebugFields ? 'shown' : 'hidden');
    }

    setupTownSearch() {
        const townSearchInput = document.getElementById('townSearch');
        const townSuggestions = document.getElementById('townSuggestions');
        
        if (!townSearchInput || !townSuggestions) {
            error('Town search elements not found');
            return;
        }
        
        townSearchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.trim();
            
            if (this.townSearchTimeout) {
                clearTimeout(this.townSearchTimeout);
            }
            
            this.townSearchTimeout = setTimeout(() => {
                this.updateTownSuggestions(searchTerm);
            }, 200);
        });
        
        townSearchInput.addEventListener('focus', (e) => {
            const searchTerm = e.target.value.trim();
            this.updateTownSuggestions(searchTerm);
        });
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.town-selector')) {
                townSuggestions.style.display = 'none';
            }
        });
    }

    updateTownSuggestions(searchTerm) {
        const townSuggestions = document.getElementById('townSuggestions');
        
        if (!searchTerm || searchTerm.length < 2) {
            townSuggestions.style.display = 'none';
            return;
        }
        
        const suggestions = this.app.parcelService.searchTowns(searchTerm);
        
        if (suggestions.length === 0) {
            townSuggestions.innerHTML = '<div class="town-suggestion" style="color: #666; font-style: italic;">No towns found</div>';
            townSuggestions.style.display = 'block';
            return;
        }
        
        const suggestionsHtml = suggestions.map(town => 
            `<div class="town-suggestion" data-town-id="${town.id}" data-town-name="${town.name}">
                ${town.name}
            </div>`
        ).join('');
        
        townSuggestions.innerHTML = suggestionsHtml;
        townSuggestions.style.display = 'block';
        
        townSuggestions.querySelectorAll('.town-suggestion').forEach(suggestion => {
            suggestion.addEventListener('click', (e) => {
                const townId = parseInt(e.target.dataset.townId);
                const townName = e.target.dataset.townName;
                this.selectTown(townId, townName);
            });
        });
    }

    selectTown(townId, townName) {
        if (this.app.selectedTownIds.includes(townId)) {
            this.showStatus(`${townName} is already selected`, 'error');
            return;
        }
        
        if (this.app.selectedTownIds.length >= 10) {
            this.showStatus('Maximum 10 towns can be selected', 'error');
            return;
        }
        
        this.app.selectedTownIds.push(townId);
        this.app.selectedTownNames.push(townName);
        
        document.getElementById('townSearch').value = '';
        document.getElementById('townSuggestions').style.display = 'none';
        
        this.updateSelectedTownsDisplay();
        this.updateLoadButton();
        
        log(`Selected town: ${townName} (${townId})`);
    }

    removeTown(townId) {
        const index = this.app.selectedTownIds.indexOf(townId);
        if (index > -1) {
            const townName = this.app.selectedTownNames[index];
            this.app.selectedTownIds.splice(index, 1);
            this.app.selectedTownNames.splice(index, 1);
            
            this.updateSelectedTownsDisplay();
            this.updateLoadButton();
            
            log(`Removed town: ${townName} (${townId})`);
        }
    }

    updateSelectedTownsDisplay() {
        const container = document.getElementById('selectedTowns');
        
        if (this.app.selectedTownIds.length === 0) {
            container.innerHTML = '<div style="font-size: 0.9em; color: #666; margin-bottom: 5px;">Selected towns: None</div>';
            return;
        }
        
        let html = '<div style="font-size: 0.9em; color: #666; margin-bottom: 5px;">Selected towns:</div>';
        
        this.app.selectedTownNames.forEach((townName, index) => {
            const townId = this.app.selectedTownIds[index];
            html += `<span class="town-tag" onclick="app.uiManager.removeTown(${townId})">
                ${townName}
                <span class="remove">×</span>
            </span>`;
        });
        
        container.innerHTML = html;
    }

    updateLoadButton() {
        const loadButton = document.getElementById('loadParcels');
        const hasSelectedTowns = this.app.selectedTownIds.length > 0;
        
        loadButton.disabled = !hasSelectedTowns;
        loadButton.textContent = hasSelectedTowns 
            ? `Load Parcel Data (${this.app.selectedTownIds.length} town${this.app.selectedTownIds.length !== 1 ? 's' : ''})` 
            : 'Load Parcel Data';
    }

    // Progress bar functionality
    showLoadingProgress() {
        const statusDiv = document.getElementById('statusMessage');
        statusDiv.innerHTML = `
            <div class="status-message status-loading">
                <div style="margin-bottom: 10px;">
                    <div id="progressText">Initializing...</div>
                    <div class="progress-bar-container">
                        <div class="progress-bar" id="progressBar"></div>
                    </div>
                    <div id="progressDetails" style="font-size: 0.85em; color: #2c5282; margin-top: 5px;"></div>
                </div>
            </div>
        `;
    }

    updateProgressBar() {
        const progressText = document.getElementById('progressText');
        const progressBar = document.getElementById('progressBar');
        const progressDetails = document.getElementById('progressDetails');
        
        if (!progressText || !progressBar || !progressDetails) return;
        
        const progress = this.app.loadingProgress;
        
        switch (progress.phase) {
            case 'loading':
                const townProgress = progress.totalTowns > 0 ? (progress.currentTown / progress.totalTowns) * 100 : 0;
                progressText.textContent = `Loading towns (${progress.currentTown}/${progress.totalTowns})`;
                progressBar.style.width = `${townProgress}%`;
                
                if (progress.currentTownName) {
                    let details = `Current: ${progress.currentTownName}`;
                    if (progress.totalChunks > 0) {
                        const chunkProgress = progress.totalFeatures > 0 ? 
                            `${progress.loadedFeatures}/${progress.totalFeatures}` : 
                            `${progress.currentChunk}/${progress.totalChunks}`;
                        details += ` (${chunkProgress} parcels)`;
                    }
                    progressDetails.textContent = details;
                }
                break;
                
            case 'deduplicating':
                progressText.textContent = 'Removing duplicate parcels...';
                progressBar.style.width = '90%';
                progressDetails.textContent = 'Processing parcel data';
                break;
                
            case 'analyzing':
                progressText.textContent = 'Analyzing fields...';
                progressBar.style.width = '95%';
                progressDetails.textContent = 'Computing field statistics';
                break;
                
            case 'rendering':
                progressText.textContent = 'Rendering parcels on map...';
                progressBar.style.width = '98%';
                progressDetails.textContent = 'Creating map visualization';
                break;
                
            case 'complete':
                progressText.textContent = 'Complete!';
                progressBar.style.width = '100%';
                progressDetails.textContent = 'Ready to import voter data';
                break;
        }
    }

    hideLoadingProgress() {
        const statusDiv = document.getElementById('statusMessage');
        statusDiv.innerHTML = '';
    }

    // UPDATED: Show parcel info with voter data
    showParcelInfo(parcelId, feature) {
        const turf = this.app.findParcelTurf(parcelId);
        const props = feature.properties;
        const objectId = props.MASTER_ADDRESS_ID;

        let infoHtml = '';

        // Show address
        const addressNum = props.ADDRESS_NUMBER || '';
        const streetName = props.STREET_NAME || '';
        const address = `${addressNum} ${streetName}`.trim();
        if (address) {
            infoHtml += `<strong>Address:</strong> ${address}<br>`;
        }
        infoHtml += `<strong>MASTER_ADDRESS_ID:</strong> ${objectId}<br>`;
        
        // Show turf assignment
        if (turf) {
            infoHtml += `<strong>Turf:</strong> <span style="color: ${turf.color};">● ${turf.name}</span><br>`;
        } else {
            infoHtml += `<strong>Turf:</strong> <span style="color: #666;">Unassigned</span><br>`;
        }
        
        // Show voter data if loaded
        if (this.app.voterDataLoaded) {
            const voters = this.app.voterService.getVotersForParcel(objectId);

            if (voters.length > 0) {
                infoHtml += '<br>';
                infoHtml += `<strong>Voters (${voters.length}):</strong><br>`;

                // Sort voters
                const sortedVoters = this.app.voterService.sortVoters(voters, this.app.voterSortBy);

                // Display voters with selected fields
                if (this.app.displayFields && this.app.displayFields.length > 0) {
                    // Show selected fields
                    sortedVoters.forEach((voter, index) => {
                        infoHtml += `<div style="padding: 5px 0; border-bottom: 1px solid #eee; font-size: 0.9em;">`;
                        infoHtml += `<strong>${index + 1}.</strong> `;

                        const fieldValues = [];
                        this.app.displayFields.forEach(field => {
                            const value = voter[field];
                            if (value !== undefined && value !== null && value !== '') {
                                const displayName = this.app.voterService.getDisplayFieldName(field);

                                // Special handling for certain fields
                                let displayValue = value;
                                if (field === 'dob') {
                                    const age = this.app.voterService.calculateAge(value);
                                    displayValue = age ? `Age ${age}` : value;
                                } else if (field === 'party') {
                                    displayValue = this.app.voterService.getPartyAbbreviation(value);
                                }

                                fieldValues.push(`${displayName}: ${displayValue}`);
                            }
                        });

                        infoHtml += fieldValues.join(' | ');
                        infoHtml += `</div>`;
                    });
                } else {
                    // Default display if no fields selected
                    sortedVoters.forEach((voter, index) => {
                        const formatted = this.app.voterService.formatVoterForDisplay(voter);

                        let voterLine = `${index + 1}. ${formatted.name}`;

                        const details = [];
                        if (formatted.party) details.push(formatted.party);
                        if (formatted.age) details.push(`Age ${formatted.age}`);

                        if (details.length > 0) {
                            voterLine += ` (${details.join(', ')})`;
                        }

                        infoHtml += `<div style="padding: 3px 0; font-size: 0.9em;">${voterLine}</div>`;
                    });
                }

                // Add voter sort controls
                infoHtml += '<div style="margin-top: 8px; font-size: 0.85em;">';
                infoHtml += '<strong>Sort by:</strong> ';
                infoHtml += `<select onchange="app.uiManager.updateVoterSortOrder(this.value)" style="font-size: 0.85em; padding: 2px;">`;
                infoHtml += `<option value="alphabetical" ${this.app.voterSortBy === 'alphabetical' ? 'selected' : ''}>Name</option>`;
                infoHtml += `<option value="party" ${this.app.voterSortBy === 'party' ? 'selected' : ''}>Party</option>`;
                infoHtml += `<option value="age" ${this.app.voterSortBy === 'age' ? 'selected' : ''}>Age</option>`;
                infoHtml += '</select>';
                infoHtml += '</div>';
            } else {
                infoHtml += '<br><div style="color: #666; font-style: italic;">No voters linked to this parcel</div>';
            }
        }
        
        // Show debug fields (parcel properties) if enabled
        if (this.app.showDebugFields && this.app.availableFields.length > 0) {
            infoHtml += '<br><div class="debug-fields">';
            infoHtml += '<strong>Debug - Parcel Properties:</strong><br>';
            
            const debugFields = ['BLDG_VAL', 'LAND_VAL', 'TOTAL_VAL', 'LOT_SIZE', 'USE_CODE', 'ZONING', 'YEAR_BUILT'];
            debugFields.forEach(field => {
                if (props.hasOwnProperty(field) && props[field]) {
                    let value = props[field];
                    
                    if (field.includes('VAL') && !isNaN(value)) {
                        value = `$${parseInt(value).toLocaleString()}`;
                    } else if (field === 'LOT_SIZE' && !isNaN(value)) {
                        value = `${parseInt(value).toLocaleString()} sq ft`;
                    }
                    
                    infoHtml += `<div style="font-size: 0.85em;">${field}: ${value}</div>`;
                }
            });
            infoHtml += '</div>';
        }
        
        document.getElementById('parcelDetails').innerHTML = infoHtml;
    }

    showClusterInfo(parcelIds) {
        if (!parcelIds || parcelIds.length === 0) return;

        // Filter out units without voters if setting is enabled
        let displayParcelIds = parcelIds;
        if (this.app.hideAddressesWithoutVoters && this.app.voterDataLoaded) {
            displayParcelIds = parcelIds.filter(parcelId => {
                const feature = this.app.parcelFeatureMap.get(parcelId);
                if (!feature) return false;
                const voters = this.app.voterService.getVotersForParcel(
                    feature.properties.MASTER_ADDRESS_ID
                );
                return voters.length > 0;
            });
        }

        // If all units filtered out, don't show cluster info
        if (displayParcelIds.length === 0) {
            this.showDefaultParcelInfo();
            return;
        }

        let infoHtml = `<strong>Multi-Unit Building (${displayParcelIds.length} units)</strong><br><br>`;

        let totalVoters = 0;

        displayParcelIds.forEach((parcelId, index) => {
            const feature = this.app.parcelFeatureMap.get(parcelId);
            if (!feature) return;

            const props = feature.properties;
            const objectId = props.MASTER_ADDRESS_ID;
            const turf = this.app.findParcelTurf(parcelId);

            // Build unit address
            const addressNum = props.ADDRESS_NUMBER || '';
            const streetName = props.STREET_NAME || '';
            const unit = props.UNIT || props.ROOM || '';
            const building = props.BUILDING || '';
            const floor = props.FLOOR || '';

            let unitAddress = `${addressNum} ${streetName}`.trim();
            if (building || floor || unit) {
                const parts = [];
                if (building) parts.push(`Bldg ${building}`);
                if (floor) parts.push(`Flr ${floor}`);
                if (unit) parts.push(`Unit ${unit}`);
                unitAddress += ` (${parts.join(', ')})`;
            }

            infoHtml += `<div style="padding: 8px; margin: 5px 0; background: #f8f9fa; border-radius: 4px;">`;
            infoHtml += `<strong>${index + 1}. ${unitAddress}</strong><br>`;
            infoHtml += `<small>ID: ${objectId}</small><br>`;

            // Show turf assignment
            if (turf) {
                infoHtml += `Turf: <span style="color: ${turf.color};">● ${turf.name}</span><br>`;
            } else {
                infoHtml += `Turf: <span style="color: #666;">Unassigned</span><br>`;
            }

            // Show detailed voter information
            if (this.app.voterDataLoaded) {
                const voters = this.app.voterService.getVotersForParcel(objectId);
                totalVoters += voters.length;

                if (voters.length > 0) {
                    infoHtml += `<strong>Voters (${voters.length}):</strong><br>`;

                    // Sort voters using same logic as showParcelInfo
                    const sortedVoters = this.app.voterService.sortVoters(voters, this.app.voterSortBy);

                    // Display each voter with selected fields
                    if (this.app.displayFields && this.app.displayFields.length > 0) {
                        sortedVoters.forEach((voter, vIndex) => {
                            const fieldValues = [];
                            this.app.displayFields.forEach(field => {
                                const value = voter[field];
                                if (value !== undefined && value !== null && value !== '') {
                                    const displayName = this.app.voterService.getDisplayFieldName(field);

                                    // Special handling for certain fields
                                    let displayValue = value;
                                    if (field === 'dob') {
                                        const age = this.app.voterService.calculateAge(value);
                                        displayValue = age ? `Age ${age}` : value;
                                    } else if (field === 'party') {
                                        displayValue = this.app.voterService.getPartyAbbreviation(value);
                                    }

                                    fieldValues.push(`${displayName}: ${displayValue}`);
                                }
                            });

                            infoHtml += `<div style="padding-left: 10px; font-size: 0.9em; margin: 2px 0;">${vIndex + 1}. ${fieldValues.join(' | ')}</div>`;
                        });
                    } else {
                        // Default display if no fields selected
                        sortedVoters.forEach((voter, vIndex) => {
                            const formatted = this.app.voterService.formatVoterForDisplay(voter);
                            let voterLine = `${vIndex + 1}. ${formatted.name}`;

                            const details = [];
                            if (formatted.party) details.push(formatted.party);
                            if (formatted.age) details.push(`Age ${formatted.age}`);

                            if (details.length > 0) {
                                voterLine += ` (${details.join(', ')})`;
                            }

                            infoHtml += `<div style="padding-left: 10px; font-size: 0.9em; margin: 2px 0;">${voterLine}</div>`;
                        });
                    }
                } else {
                    infoHtml += `<div style="color: #666; font-style: italic; font-size: 0.9em;">No voters at this unit</div>`;
                }
            }

            infoHtml += `</div>`;
        });

        if (this.app.voterDataLoaded) {
            infoHtml += `<br><strong>Total voters across all units: ${totalVoters}</strong>`;

            // Add voter sort controls (same as showParcelInfo)
            infoHtml += '<div style="margin-top: 8px; font-size: 0.85em;">';
            infoHtml += '<strong>Sort by:</strong> ';
            infoHtml += `<select onchange="app.uiManager.updateVoterSortOrder(this.value)" style="font-size: 0.85em; padding: 2px;">`;
            infoHtml += `<option value="alphabetical" ${this.app.voterSortBy === 'alphabetical' ? 'selected' : ''}>Name</option>`;
            infoHtml += `<option value="party" ${this.app.voterSortBy === 'party' ? 'selected' : ''}>Party</option>`;
            infoHtml += `<option value="age" ${this.app.voterSortBy === 'age' ? 'selected' : ''}>Age</option>`;
            infoHtml += '</select>';
            infoHtml += '</div>';
        }

        document.getElementById('parcelDetails').innerHTML = infoHtml;
    }

    showDefaultParcelInfo() {
        let html = '<div style="color: #666; font-style: italic;">Hover over a parcel to see details<br>Click a parcel to keep it selected</div>';
        
        // Show voter import prompt if parcels loaded but no voter data
        if (this.app.parcelDataLoaded && !this.app.voterDataLoaded) {
            html += '<br><div style="background: #e6f3ff; padding: 10px; border-radius: 6px; margin-top: 10px;">';
            html += '<strong>Next step:</strong> Import voter data to link voters to parcels<br>';
            html += '<button onclick="app.uiManager.showVoterImportDialog()" class="btn btn-primary btn-small" style="margin-top: 5px;">Import Voter Data</button>';
            html += '</div>';
        }
        
        document.getElementById('parcelDetails').innerHTML = html;
    }

    setupDebouncedSearch() {
        this.debouncedFieldSearch = this.debounce((field, searchTerm) => {
            this.performFieldSearch(field, searchTerm);
        }, 150);
        
        this.debouncedBulkFieldSearch = this.debounce((field, searchTerm) => {
            this.performBulkFieldSearch(field, searchTerm);
        }, 150);
        
        this.debouncedUpdateBulkAssignment = this.debounce(() => {
            this.createBulkAssignmentControls();
        }, 200);
    }

    performFieldSearch(field, searchTerm) {
        const stats = this.app.fieldStats[field];
        if (!stats || stats.type !== 'categorical') return;
        
        const container = document.getElementById(`filter_${field}_checkboxes`);
        if (!container) return;
        
        const checkedValues = new Set(
            Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
                .map(checkbox => checkbox.value)
        );
        
        const allValues = stats.uniqueValues;
        const maxResults = 100;
        
        let finalValues = [];
        
        if (!searchTerm.trim()) {
            const checkedArray = Array.from(checkedValues);
            const uncheckedValues = allValues.filter(val => !checkedValues.has(val));
            
            finalValues = [
                ...uncheckedValues.slice(0, maxResults - checkedArray.length),
                ...checkedArray
            ];
        } else {
            const searchLower = searchTerm.toLowerCase();
            const checkedArray = Array.from(checkedValues);
            
            const matchingValues = allValues
                .filter(val => val.toLowerCase().includes(searchLower) && !checkedValues.has(val))
                .slice(0, maxResults - checkedArray.length);
            
            finalValues = [...matchingValues, ...checkedArray];
        }
        
        const checkboxesHtml = finalValues.map(val => 
            `<label class="checkbox-option">
                <input type="checkbox" value="${val}" ${checkedValues.has(val) ? 'checked' : ''}> ${val}
            </label>`
        ).join('');
        
        let hintText = '';
        if (searchTerm.trim()) {
            const totalMatches = allValues.filter(val => val.toLowerCase().includes(searchTerm.toLowerCase())).length;
            const checkedCount = checkedValues.size;
            const matchingShown = finalValues.length - checkedCount;
            
            if (checkedCount > 0) {
                hintText = `${matchingShown} matches shown • ${checkedCount} selected`;
                if (totalMatches > matchingShown) {
                    hintText += ` (${totalMatches} total matches)`;
                }
            } else {
                hintText = totalMatches > maxResults ? 
                    `Showing first ${maxResults} of ${totalMatches} matches` : 
                    `${totalMatches} matches found`;
            }
        } else {
            const checkedCount = checkedValues.size;
            const hasMore = allValues.length > finalValues.length;
            
            if (checkedCount > 0) {
                hintText = `${checkedCount} selected`;
                if (hasMore) hintText += ` • showing ${finalValues.length} total`;
            } else if (hasMore) {
                hintText = 'Type to search through all options';
            }
        }
        
        container.innerHTML = checkboxesHtml + 
            (hintText ? `<div class="search-hint" style="padding: 5px; font-style: italic; color: #666; font-size: 0.7em;">${hintText}</div>` : '');
    }

    // Collapsible section toggles
    toggleFields() {
        this.app.fieldsExpanded = !this.app.fieldsExpanded;
        const content = document.getElementById('fieldsContent');
        const toggle = document.getElementById('fieldsToggle');
        
        if (this.app.fieldsExpanded) {
            content.classList.add('expanded');
            toggle.classList.add('expanded');
        } else {
            content.classList.remove('expanded');
            toggle.classList.remove('expanded');
        }
    }

    toggleVoterImport() {
        this.app.voterImportExpanded = !this.app.voterImportExpanded;
        const content = document.getElementById('voterImportContent');
        const toggle = document.getElementById('voterImportToggle');
        
        if (this.app.voterImportExpanded) {
            content.classList.add('expanded');
            toggle.classList.add('expanded');
        } else {
            content.classList.remove('expanded');
            toggle.classList.remove('expanded');
        }
    }

    toggleDataManagement() {
        this.app.dataManagementExpanded = !this.app.dataManagementExpanded;
        const content = document.getElementById('dataManagementContent');
        const toggle = document.getElementById('dataManagementToggle');
        
        if (this.app.dataManagementExpanded) {
            content.classList.add('expanded');
            toggle.classList.add('expanded');
        } else {
            content.classList.remove('expanded');
            toggle.classList.remove('expanded');
        }
    }

    toggleFilters() {
        this.app.filtersExpanded = !this.app.filtersExpanded;
        const content = document.getElementById('filterContent');
        const toggle = document.getElementById('filterToggle');
        
        if (this.app.filtersExpanded) {
            content.classList.add('expanded');
            toggle.classList.add('expanded');
        } else {
            content.classList.remove('expanded');
            toggle.classList.remove('expanded');
        }
    }

    toggleBulkAssignment() {
        this.app.bulkAssignmentExpanded = !this.app.bulkAssignmentExpanded;
        const content = document.getElementById('bulkAssignmentContent');
        const toggle = document.getElementById('bulkAssignmentToggle');

        if (this.app.bulkAssignmentExpanded) {
            content.classList.add('expanded');
            toggle.classList.add('expanded');
        } else {
            content.classList.remove('expanded');
            toggle.classList.remove('expanded');
        }
    }

    toggleKMeans() {
        this.app.kmeansExpanded = !this.app.kmeansExpanded;
        const content = document.getElementById('kmeansContent');
        const toggle = document.getElementById('kmeansToggle');

        if (this.app.kmeansExpanded) {
            content.style.display = 'block';
            toggle.textContent = '▼';
        } else {
            content.style.display = 'none';
            toggle.textContent = '▶';
        }

        // Bind the run button event when expanded
        if (this.app.kmeansExpanded) {
            const runButton = document.getElementById('runKMeans');
            if (runButton) {
                runButton.onclick = () => this.app.performKMeansClustering();
            }

            // Bind preview update events
            const targetUnitsInput = document.getElementById('targetUnits');
            const includeUnlockedCheckbox = document.getElementById('includeUnlockedRoutes');

            if (targetUnitsInput) {
                targetUnitsInput.addEventListener('input', () => this.updateKMeansPreview());
            }

            if (includeUnlockedCheckbox) {
                includeUnlockedCheckbox.addEventListener('change', () => this.updateKMeansPreview());
            }

            // Initial preview update
            this.updateKMeansPreview();
        }
    }

    updateKMeansPreview() {
        const previewDiv = document.getElementById('kmeansPreview');
        const statsDiv = document.getElementById('kmeansStats');

        if (!this.app.parcelDataLoaded) {
            previewDiv.style.display = 'none';
            return;
        }

        const targetUnits = parseInt(document.getElementById('targetUnits').value);
        const includeUnlocked = document.getElementById('includeUnlockedRoutes').checked;

        if (!targetUnits || targetUnits < 1) {
            previewDiv.style.display = 'none';
            return;
        }

        // Calculate total available units
        let totalUnits = 0;
        this.app.parcelData.features.forEach(feature => {
            const parcelId = this.app.getParcelId(feature);
            const currentTurf = this.app.findParcelTurf(parcelId);

            if (currentTurf && currentTurf.locked) return;
            if (!includeUnlocked && currentTurf) return;

            const masterId = feature.properties.MASTER_ADDRESS_ID;
            const voters = this.app.voterDataLoaded ?
                this.app.voterService.getVotersForParcel(masterId) : [];

            // Skip addresses with no voters when voter data is loaded
            if (this.app.voterDataLoaded && voters.length === 0) return;

            totalUnits += Math.max(voters.length, 1);
        });

        const optimalK = Math.max(1, Math.ceil(totalUnits / targetUnits));
        const unlockedCount = Array.from(this.app.turfs.values()).filter(t => !t.locked).length;
        const willCreate = Math.max(0, optimalK - unlockedCount);

        previewDiv.style.display = 'block';
        statsDiv.innerHTML = `
            • Total units to distribute: <strong>${totalUnits}</strong><br>
            • Target per route: <strong>${targetUnits}</strong><br>
            • Optimal turfs needed: <strong>${optimalK}</strong><br>
            • Current unlocked turfs: <strong>${unlockedCount}</strong><br>
            ${willCreate > 0 ?
                `<span style="color: #2c5282;">➜ Will auto-create <strong>${willCreate}</strong> new turf(s)</span>` :
                `<span style="color: #22543d;">✓ Sufficient turfs available</span>`
            }
        `;
    }

    togglePrint() {
        this.app.printExpanded = !this.app.printExpanded;
        const content = document.getElementById('printContent');
        const toggle = document.getElementById('printToggle');

        if (this.app.printExpanded) {
            content.style.display = 'block';
            toggle.textContent = '▼';
        } else {
            content.style.display = 'none';
            toggle.textContent = '▶';
        }

        // Bind print button events when expanded
        if (this.app.printExpanded) {
            const printSelectedButton = document.getElementById('printSelectedTurf');
            const printAllButton = document.getElementById('printAllTurfs');
            const printLockedButton = document.getElementById('printLockedTurfs');

            if (printSelectedButton) {
                printSelectedButton.onclick = () => this.app.printSelectedTurf();
            }

            if (printAllButton) {
                printAllButton.onclick = () => this.app.printAllTurfs();
            }

            if (printLockedButton) {
                printLockedButton.onclick = () => this.app.printLockedTurfs();
            }
        }
    }

    toggleReferenceLayers() {
        this.app.referenceLayersExpanded = !this.app.referenceLayersExpanded;
        const content = document.getElementById('referenceLayersContent');
        const toggle = document.getElementById('referenceLayersToggle');
        
        if (this.app.referenceLayersExpanded) {
            content.classList.add('expanded');
            toggle.classList.add('expanded');
        } else {
            content.classList.remove('expanded');
            toggle.classList.remove('expanded');
        }
    }

    createFieldDisplayControls() {
        const container = document.getElementById('fieldsContent');
        if (!container) return;
        
        let html = '';
        
        // If voter data is loaded, show voter fields
        if (this.app.voterDataLoaded) {
            const voterFields = this.app.voterService.getAvailableVoterFields();
            
            if (voterFields.length > 0) {
                html += '<div style="margin-bottom: 10px;">';
                html += '<label style="font-size: 0.9em; color: #333; margin-bottom: 8px; display: block;">Select voter fields to display:</label>';
                html += '<div class="checkbox-container" style="max-height: 200px; overflow-y: auto;">';
                
                voterFields.forEach(field => {
                    const isChecked = this.app.displayFields.includes(field);
                    const displayName = this.app.voterService.getDisplayFieldName(field);
                    html += `
                        <label class="checkbox-option">
                            <input type="checkbox" value="${field}" ${isChecked ? 'checked' : ''} 
                                   onchange="app.uiManager.updateDisplayFields()"> ${displayName}
                        </label>
                    `;
                });
                
                html += '</div>';
                html += '<div style="font-size: 0.8em; color: #666; margin-top: 8px;">Selected fields will appear in the parcel info panel.</div>';
                html += '</div>';
            }
            
            // Add debug toggle
            html += '<div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e0e0e0;">';
            html += '<label class="checkbox-option">';
            html += `<input type="checkbox" id="debugFieldsToggle" ${this.app.showDebugFields ? 'checked' : ''} onchange="app.uiManager.toggleDebugFields()">`;
            html += ' Show debug parcel properties';
            html += '</label>';
            html += '<div style="font-size: 0.8em; color: #666; margin-top: 5px;">Enable to see parcel data (building value, lot size, etc.)</div>';
            html += '</div>';
        } else {
            // No voter data - show message
            html = '<div style="color: #666; font-style: italic; text-align: center; padding: 20px;">';
            html += 'Import voter data to configure display fields';
            html += '</div>';
        }
        
        container.innerHTML = html;
    }

    updateDisplayFields() {
        const checkboxes = document.querySelectorAll('#fieldsContent input[type="checkbox"]:not(#debugFieldsToggle):checked');
        this.app.displayFields = Array.from(checkboxes).map(cb => cb.value);
        
        if (this.app.clickedParcel) {
            this.showParcelInfo(this.app.clickedParcel.parcelId, this.app.clickedParcel.feature);
        }
        
        log('Display fields updated:', this.app.displayFields);
    }

    createDataManagementControls() {
        const container = document.getElementById('dataManagementContent');
        if (!container) return;
        
        let html = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 15px;">
                <button onclick="app.dataManager.exportTurfCSV()" class="btn btn-secondary" style="font-size: 12px;">Export Turfs</button>
                <button onclick="app.dataManager.exportDetailedCSV()" class="btn btn-secondary" style="font-size: 12px;">Export with Voters</button>
                <button onclick="app.dataManager.showImportDialog()" class="btn btn-secondary" style="font-size: 12px;">Import Turfs</button>
                <button onclick="app.selectTurf(null)" class="btn btn-secondary" style="font-size: 12px;">Deselect All</button>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="font-size: 0.9em; color: #333; margin-bottom: 5px; display: block;">Parcel Layer Opacity:</label>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="range" id="opacitySlider" min="10" max="100" value="70" 
                           oninput="app.updateOpacity(this.value); document.getElementById('opacityValue').textContent = this.value + '%'"
                           style="flex: 1;">
                    <span id="opacityValue" style="font-size: 12px; min-width: 30px;">70%</span>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
    }

    createFilterControls() {
        const container = document.getElementById('filterContent');
        const htmlParts = [];
        
        htmlParts.push(`
            <div id="activeFilters" class="active-filters" style="display: none;">
                <strong>Active Filters:</strong>
                <div id="filterTags"></div>
                <button onclick="app.uiManager.clearAllFilters()" class="btn btn-secondary btn-small" style="margin-top: 5px;">Clear All</button>
            </div>
        `);

        // Add "hide addresses without voters" checkbox if voter data is loaded
        if (this.app.voterDataLoaded) {
            htmlParts.push(`
                <div style="margin-bottom: 10px; padding: 8px; background: #f8f9fa; border-radius: 4px;">
                    <label style="display: flex; align-items: center; cursor: pointer; font-size: 0.9em;">
                        <input type="checkbox" id="hideAddressesWithoutVoters"
                               ${this.app.hideAddressesWithoutVoters ? 'checked' : ''}
                               onchange="app.toggleHideAddressesWithoutVoters()"
                               style="margin-right: 8px;">
                        Hide addresses without voters
                    </label>
                </div>
            `);
        }

        // If voter data is loaded, use voter fields for filtering
        if (this.app.voterDataLoaded && this.app.fieldStats) {
            const voterFields = Object.keys(this.app.fieldStats);
            
            voterFields.forEach(field => {
                const stats = this.app.fieldStats[field];
                if (!stats || stats.type === 'empty') return;
                
                const displayName = this.app.voterService.getDisplayFieldName(field);
                
                if (stats.type === 'numeric') {
                    htmlParts.push(`
                        <div class="filter-item">
                            <label>${displayName} (${stats.values ? stats.values.length : 0} values):</label>
                            <div class="filter-controls" data-field="${field}">
                                <input type="number" class="filter-input" placeholder="Min" 
                                    id="filter_${field}_min" step="any">
                                <span class="range-separator">to</span>
                                <input type="number" class="filter-input" placeholder="Max" 
                                    id="filter_${field}_max" step="any">
                                <button class="btn btn-secondary btn-small" 
                                        onclick="app.uiManager.applyFieldFilter('${field}')" style="margin-top: 5px;">Apply</button>
                            </div>
                        </div>
                    `);
                } else {
                    const initialLimit = 100;
                    const uniqueValues = stats.uniqueValues;
                    const initialValues = uniqueValues.slice(0, initialLimit);
                    const hasMore = uniqueValues.length > initialLimit;
                    
                    const checkboxesHtml = initialValues.map(val => 
                        `<label class="checkbox-option">
                            <input type="checkbox" value="${val}"> ${val}
                        </label>`
                    ).join('');
                    
                    htmlParts.push(`
                        <div class="filter-item">
                            <label>${displayName} (${stats.valueCount || 0} unique${hasMore ? `, showing first ${initialLimit}` : ''}):</label>
                            <div class="filter-controls" data-field="${field}">
                                <input type="text" class="filter-input" placeholder="Search values..." 
                                    id="filter_${field}_search" 
                                    oninput="app.uiManager.debouncedFieldSearch('${field}', this.value)"
                                    style="margin-bottom: 5px; width: 100%;">
                                <div class="checkbox-container" id="filter_${field}_checkboxes" style="max-height: 120px; overflow-y: auto;">
                                    ${checkboxesHtml}
                                    ${hasMore ? '<div class="search-hint" style="padding: 5px; font-style: italic; color: #666; font-size: 0.7em;">Type to search through all options</div>' : ''}
                                </div>
                                <button class="btn btn-secondary btn-small" 
                                        onclick="app.uiManager.applyFieldFilter('${field}')" style="margin-top: 5px;">Apply</button>
                            </div>
                        </div>
                    `);
                }
            });
        } else {
            htmlParts.push('<div style="color: #666; font-style: italic; text-align: center;">Import voter data to enable filtering</div>');
        }
        
        container.innerHTML = htmlParts.join('');
    }

    createBulkAssignmentControls() {
        const container = document.getElementById('bulkAssignmentContent');
        if (!container) return;
        
        // Create turf selector
        let turfOptions = '<option value="">Unassigned</option>';
        for (const [name, turf] of this.app.turfs) {
            turfOptions += `<option value="${name}">${name}</option>`;
        }
        
        const htmlParts = [`
            <div class="bulk-assignment-target">
                <label><strong>Assign matching parcels to:</strong></label>
                <select id="bulkAssignmentTarget" class="filter-select" style="width: 100%; margin-bottom: 15px;">
                    ${turfOptions}
                </select>
            </div>
            <div class="bulk-assignment-conditions">
                <label><strong>Conditions (all must match):</strong></label>
        `];
        
        // If voter data is loaded, use voter fields for bulk assignment
        if (this.app.voterDataLoaded && this.app.fieldStats) {
            const fields = Object.keys(this.app.fieldStats);
            
            fields.forEach(field => {
                const stats = this.app.fieldStats[field];
                if (!stats || stats.type === 'empty') return;
                
                const displayName = this.app.voterService.getDisplayFieldName(field);
                
                if (stats.type === 'numeric') {
                    htmlParts.push(`
                        <div class="filter-item">
                            <label>${displayName}:</label>
                            <div class="filter-controls" data-field="${field}">
                                <input type="number" class="filter-input" placeholder="Min" 
                                    id="bulk_${field}_min" step="any">
                                <span class="range-separator">to</span>
                                <input type="number" class="filter-input" placeholder="Max" 
                                    id="bulk_${field}_max" step="any">
                            </div>
                        </div>
                    `);
                } else {
                    const initialLimit = 100;
                    const uniqueValues = stats.uniqueValues;
                    const initialValues = uniqueValues.slice(0, initialLimit);
                    const hasMore = uniqueValues.length > initialLimit;
                    
                    const checkboxesHtml = initialValues.map(val => 
                        `<label class="checkbox-option">
                            <input type="checkbox" value="${val}"> ${val}
                        </label>`
                    ).join('');
                    
                    htmlParts.push(`
                        <div class="filter-item">
                            <label>${displayName}${hasMore ? ` (${stats.valueCount} total, showing first ${initialLimit})` : ''}:</label>
                            <div class="filter-controls" data-field="${field}">
                                <input type="text" class="filter-input" placeholder="Search values..." 
                                    id="bulk_${field}_search" 
                                    oninput="app.uiManager.debouncedBulkFieldSearch('${field}', this.value)"
                                    style="margin-bottom: 5px; width: 100%;">
                                <div class="checkbox-container" id="bulk_${field}_checkboxes" style="max-height: 120px; overflow-y: auto;">
                                    ${checkboxesHtml}
                                    ${hasMore ? '<div class="search-hint" style="padding: 5px; font-style: italic; color: #666; font-size: 0.7em;">Type to search through all options</div>' : ''}
                                </div>
                            </div>
                        </div>
                    `);
                }
            });
        } else {
            htmlParts.push('<div style="color: #666; font-style: italic; text-align: center; margin: 20px 0;">Import voter data to enable bulk assignment</div>');
        }
        
        htmlParts.push(`
            </div>
            <button onclick="app.performBulkAssignment()" class="btn btn-primary" style="width: 100%; margin-top: 10px;">Apply Bulk Assignment</button>
        `);
        
        container.innerHTML = htmlParts.join('');
    }

    performBulkFieldSearch(field, searchTerm) {
        const stats = this.app.fieldStats[field];
        if (!stats || stats.type !== 'categorical') return;
        
        const container = document.getElementById(`bulk_${field}_checkboxes`);
        if (!container) return;
        
        const checkedValues = new Set(
            Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
                .map(checkbox => checkbox.value)
        );
        
        const allValues = stats.uniqueValues;
        const maxResults = 100;
        
        let finalValues = [];
        
        if (!searchTerm.trim()) {
            const checkedArray = Array.from(checkedValues);
            const uncheckedValues = allValues.filter(val => !checkedValues.has(val));
            
            finalValues = [
                ...uncheckedValues.slice(0, maxResults - checkedArray.length),
                ...checkedArray
            ];
        } else {
            const searchLower = searchTerm.toLowerCase();
            const checkedArray = Array.from(checkedValues);
            
            const matchingValues = allValues
                .filter(val => val.toLowerCase().includes(searchLower) && !checkedValues.has(val))
                .slice(0, maxResults - checkedArray.length);
            
            finalValues = [...matchingValues, ...checkedArray];
        }
        
        const checkboxesHtml = finalValues.map(val => 
            `<label class="checkbox-option">
                <input type="checkbox" value="${val}" ${checkedValues.has(val) ? 'checked' : ''}> ${val}
            </label>`
        ).join('');
        
        let hintText = '';
        if (searchTerm.trim()) {
            const totalMatches = allValues.filter(val => val.toLowerCase().includes(searchTerm.toLowerCase())).length;
            const checkedCount = checkedValues.size;
            const matchingShown = finalValues.length - checkedCount;
            
            if (checkedCount > 0) {
                hintText = `${matchingShown} matches shown • ${checkedCount} selected`;
                if (totalMatches > matchingShown) {
                    hintText += ` (${totalMatches} total matches)`;
                }
            } else {
                hintText = totalMatches > maxResults ? 
                    `Showing first ${maxResults} of ${totalMatches} matches` : 
                    `${totalMatches} matches found`;
            }
        } else {
            const checkedCount = checkedValues.size;
            const hasMore = allValues.length > finalValues.length;
            
            if (checkedCount > 0) {
                hintText = `${checkedCount} selected`;
                if (hasMore) hintText += ` • showing ${finalValues.length} total`;
            } else if (hasMore) {
                hintText = 'Type to search through all options';
            }
        }
        
        container.innerHTML = checkboxesHtml + 
            (hintText ? `<div class="search-hint" style="padding: 5px; font-style: italic; color: #666; font-size: 0.7em;">${hintText}</div>` : '');
    }

    applyFieldFilter(field) {
        const stats = this.app.fieldStats[field];
        let filterValue = null;
        
        if (stats.type === 'numeric') {
            const minEl = document.getElementById(`filter_${field}_min`);
            const maxEl = document.getElementById(`filter_${field}_max`);
            const min = minEl.value ? parseFloat(minEl.value) : null;
            const max = maxEl.value ? parseFloat(maxEl.value) : null;
            
            if (min !== null || max !== null) {
                filterValue = { type: 'numeric', min, max };
            }
        } else {
            const container = document.getElementById(`filter_${field}_checkboxes`);
            const selected = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
                .map(checkbox => checkbox.value)
                .filter(val => val !== '');
            
            if (selected.length > 0) {
                filterValue = { type: 'categorical', values: selected };
            }
        }
        
        if (filterValue) {
            this.app.activeFilters.set(field, filterValue);
        } else {
            this.app.activeFilters.delete(field);
        }
        
        this.updateFilterDisplay();
        this.applyFilters();
    }

    clearFieldFilter(field) {
        this.app.activeFilters.delete(field);

        const stats = this.app.fieldStats[field];
        if (stats.type === 'numeric') {
            const minEl = document.getElementById(`filter_${field}_min`);
            const maxEl = document.getElementById(`filter_${field}_max`);
            if (minEl) minEl.value = '';
            if (maxEl) maxEl.value = '';
        } else {
            const searchEl = document.getElementById(`filter_${field}_search`);
            if (searchEl) {
                searchEl.value = '';
            }

            // Refresh the checkbox list to show all values again
            this.performFieldSearch(field, '');
        }

        this.updateFilterDisplay();
        this.applyFilters();
    }

    clearAllFilters() {
        this.app.activeFilters.clear();

        const fields = Object.keys(this.app.fieldStats);
        fields.forEach(field => {
            const stats = this.app.fieldStats[field];
            if (!stats || stats.type === 'empty') return;

            if (stats.type === 'numeric') {
                const minEl = document.getElementById(`filter_${field}_min`);
                const maxEl = document.getElementById(`filter_${field}_max`);
                if (minEl) minEl.value = '';
                if (maxEl) maxEl.value = '';
            } else {
                const searchEl = document.getElementById(`filter_${field}_search`);
                if (searchEl) {
                    searchEl.value = '';
                }

                // Refresh the checkbox list to show all values again
                this.performFieldSearch(field, '');
            }
        });

        this.updateFilterDisplay();
        this.applyFilters();
    }

    updateFilterDisplay() {
        const activeFiltersDiv = document.getElementById('activeFilters');
        const filterTagsDiv = document.getElementById('filterTags');
        
        if (!activeFiltersDiv || !filterTagsDiv) {
            return;
        }
        
        if (this.app.activeFilters.size === 0) {
            activeFiltersDiv.style.display = 'none';
            return;
        }
        
        activeFiltersDiv.style.display = 'block';
        
        let tagsHtml = '';
        this.app.activeFilters.forEach((filter, field) => {
            const displayName = this.app.voterDataLoaded 
                ? this.app.voterService.getDisplayFieldName(field)
                : field;
            let displayText = '';
            
            if (filter.type === 'numeric') {
                if (filter.min !== null && filter.max !== null) {
                    displayText = `${displayName}: ${filter.min} - ${filter.max}`;
                } else if (filter.min !== null) {
                    displayText = `${displayName}: ≥ ${filter.min}`;
                } else if (filter.max !== null) {
                    displayText = `${displayName}: ≤ ${filter.max}`;
                }
            } else {
                const valueText = filter.values.length > 3 
                    ? `${filter.values.slice(0, 3).join(', ')}... (+${filter.values.length - 3})`
                    : filter.values.join(', ');
                displayText = `${displayName}: ${valueText}`;
            }
            
            tagsHtml += `<span class="filter-tag" onclick="app.uiManager.clearFieldFilter('${field}')">${displayText} ✕</span>`;
        });
        
        filterTagsDiv.innerHTML = tagsHtml;
    }

    applyFilters(showStatus = true) {
        if (!this.app.parcelsLayer) return;

        let visibleCount = 0;
        this.app.filteredParcels.clear();

        const hasActiveFilters = this.app.activeFilters.size > 0;
        const filterEntries = hasActiveFilters ? Array.from(this.app.activeFilters.entries()) : null;

        log(`Applying filters: ${hasActiveFilters ? this.app.activeFilters.size : 0} active filters`);

        const styleUpdates = [];

        this.app.parcelsLayer.eachLayer(layer => {
            const feature = layer.feature;
            const parcelId = this.app.getParcelId(feature);
            const addressId = feature.properties.MASTER_ADDRESS_ID;
            let visible = true;

            // Check if hiding addresses without voters
            if (this.app.hideAddressesWithoutVoters && this.app.voterDataLoaded) {
                const voters = this.app.voterService.getVotersForParcel(addressId);
                if (voters.length === 0) {
                    visible = false;
                }
            }
            
            if (hasActiveFilters && visible) {
                for (const [field, filter] of filterEntries) {
                    let matches = false;

                    // FIRST: Check address point properties
                    if (feature.properties.hasOwnProperty(field)) {
                        const value = feature.properties[field];

                        if (filter.type === 'numeric') {
                            const numValue = parseFloat(value);
                            if (!isNaN(numValue) &&
                                (filter.min === null || numValue >= filter.min) &&
                                (filter.max === null || numValue <= filter.max)) {
                                matches = true;
                            }
                        } else {
                            if (filter.values.includes(String(value))) {
                                matches = true;
                            }
                        }
                    }

                    // SECOND: If not in address props, check voter data
                    if (!matches && this.app.voterDataLoaded) {
                        const voters = this.app.voterService.getVotersForParcel(addressId);
                        if (voters.length > 0) {
                            matches = voters.some(voter => {
                                const voterValue = voter[field];
                                if (filter.type === 'numeric') {
                                    const num = parseFloat(voterValue);
                                    return !isNaN(num) &&
                                           (filter.min === null || num >= filter.min) &&
                                           (filter.max === null || num <= filter.max);
                                } else {
                                    return filter.values.includes(String(voterValue));
                                }
                            });
                        }
                    }

                    if (!matches) {
                        visible = false;
                        break;
                    }
                }
            }
            
            styleUpdates.push({ layer, parcelId, visible });
            
            if (visible) {
                visibleCount++;
            } else {
                this.app.filteredParcels.add(parcelId);
            }
        });
        
        log(`Filter results: ${visibleCount} visible, ${styleUpdates.length - visibleCount} hidden`);
        
        styleUpdates.forEach(({ layer, parcelId, visible }) => {
            if (visible) {
                layer.setStyle(this.app.getParcelStyle(parcelId));
                if (!layer._hasEvents) {
                    layer.on('click', layer._clickHandler);
                    layer.on('mouseover', layer._mouseoverHandler);
                    layer.on('mouseout', layer._mouseoutHandler);
                    layer._hasEvents = true;
                }
            } else {
                layer.setStyle({
                    opacity: 0,
                    fillOpacity: 0,
                    stroke: false,
                    fill: false
                });
                if (layer._hasEvents) {
                    layer.off('click', layer._clickHandler);
                    layer.off('mouseover', layer._mouseoverHandler);
                    layer.off('mouseout', layer._mouseoutHandler);
                    layer._hasEvents = false;
                }
            }
        });
        
        this.app.map.invalidateSize();
        
        // Remove filtered parcels from selection (per user preference)
        if (this.app.selectedParcels.size > 0) {
            let removedCount = 0;
            this.app.filteredParcels.forEach(parcelId => {
                if (this.app.selectedParcels.has(parcelId)) {
                    this.app.selectedParcels.delete(parcelId);
                    removedCount++;
                }
            });
            if (removedCount > 0) {
                this.app.updateSelectionHighlight();
                this.createMultiSelectControls();
            }
        }

        if (showStatus) {
            this.showStatus(`Filter applied: ${visibleCount} of ${this.app.parcelData.features.length} parcels visible`, 'success');
        }
        this.updateTurfsList();

        log(`Filter application completed`);
    }

    // Undo notification system
    showUndoNotification() {
        if (!this.app.undoState || !this.app.undoDescription) return;
        
        const undoDiv = document.getElementById('undoNotification');
        undoDiv.innerHTML = `
            <div class="undo-notification">
                <strong>Action completed:</strong> ${this.app.undoDescription}
                <div class="undo-actions">
                    <button onclick="app.restoreUndoState()" class="btn btn-primary btn-small">Undo</button>
                    <button onclick="app.dataManager.exportPreviousState()" class="btn btn-secondary btn-small">Export Previous State</button>
                    <button onclick="app.clearUndoState()" class="btn btn-secondary btn-small">Dismiss</button>
                </div>
            </div>
        `;
        
        log('Undo notification shown for:', this.app.undoDescription);
    }

    hideUndoNotification() {
        const undoDiv = document.getElementById('undoNotification');
        undoDiv.innerHTML = '';
        log('Undo notification hidden');
    }

    updateFieldSelector() {
        this.createFieldDisplayControls();
    }

    collapseDataLoadingSection() {
        const instructionsDiv = document.querySelector('.instructions');
        const townSelector = document.querySelector('.town-selector').parentElement;
        
        if (instructionsDiv) {
            instructionsDiv.style.display = 'none';
        }
        if (townSelector) {
            townSelector.style.display = 'none';
        }
        
        const parcelInfoSection = document.getElementById('parcelInfoSection');
        if (parcelInfoSection) {
            parcelInfoSection.classList.add('visible');
        }
        
        const controlSections = ['fieldsSection', 'dataManagementSection', 'voterImportSection', 'referenceLayersSection', 'parcelFilters', 'bulkAssignment', 'kmeansSection', 'printSection', 'multiSelectSection'];
        controlSections.forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (section) {
                section.classList.add('visible');
            }
        });
        
        this.createFieldDisplayControls();
        this.createDataManagementControls();
        this.createFilterControls();
        this.createBulkAssignmentControls();
        this.app.referenceLayerManager.createReferenceLayerControls();
        
        this.updateTurfsList();
        this.showDefaultParcelInfo();
    }

    // RENAMED: updateNeighborhoodsList → updateTurfsList
    updateTurfsList() {
        const container = document.getElementById('turfsList');
        
        const fragment = document.createDocumentFragment();
        
        // Add turf creation section
        const creationDiv = document.createElement('div');
        creationDiv.className = 'turf-creation';
        creationDiv.innerHTML = `
            <div class="control-group">
                <label>Create New Turf:</label>
                <div class="turf-controls">
                    <input type="text" id="turfName" class="turf-input" placeholder="Route 1, Route 2, Route 3..." />
                    <button id="addTurf" class="btn btn-primary">Add</button>
                </div>
                <div style="font-size: 0.75em; color: #666; margin-top: 4px;">
                    Tip: Separate multiple names with commas for bulk creation
                </div>
            </div>
        `;
        fragment.appendChild(creationDiv);

        // Add Lock All / Unlock All buttons if there are turfs
        if (this.app.turfs.size > 0) {
            const lockControlsDiv = document.createElement('div');
            lockControlsDiv.className = 'lock-controls';
            lockControlsDiv.style.cssText = 'margin: 10px 0; display: flex; gap: 8px; flex-wrap: wrap;';
            lockControlsDiv.innerHTML = `
                <button id="lockAllTurfs" class="btn btn-secondary btn-small" title="Lock all turfs to prevent editing">Lock All</button>
                <button id="unlockAllTurfs" class="btn btn-secondary btn-small" title="Unlock all turfs">Unlock All</button>
            `;
            fragment.appendChild(lockControlsDiv);
        }

        if (this.app.turfs.size === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.style.textAlign = 'center';
            emptyDiv.style.color = '#666';
            emptyDiv.style.fontStyle = 'italic';
            emptyDiv.style.marginTop = '20px';
            emptyDiv.textContent = 'No turfs created yet. Add one above to get started!';
            fragment.appendChild(emptyDiv);
        } else {
            const hasActiveFilters = this.app.activeFilters.size > 0;

            // Sort turfs alphabetically by name with natural number sorting
            const sortedTurfs = Array.from(this.app.turfs.entries()).sort((a, b) =>
                a[0].localeCompare(b[0], undefined, { sensitivity: 'base', numeric: true })
            );

            for (const [name, turf] of sortedTurfs) {
                const isSelected = this.app.selectedTurf === name;
                const isEditing = this.app.editingTurf === name;
                
                const visibleParcelCount = hasActiveFilters 
                    ? Array.from(turf.parcels).filter(parcelId => !this.app.filteredParcels.has(parcelId)).length
                    : turf.parcels.size;
                
                const totalParcels = turf.parcels.size;
                const filterNote = hasActiveFilters && visibleParcelCount !== totalParcels
                    ? ` (${totalParcels} total)`
                    : '';
                
                // Calculate voter count if voter data loaded
                let voterCount = 0;
                if (this.app.voterDataLoaded) {
                    for (const parcelId of turf.parcels) {
                        // Find the feature to get MASTER_ADDRESS_ID
                        const feature = this.app.parcelData.features.find(f =>
                            this.app.getParcelId(f) === parcelId
                        );
                        if (feature) {
                            const voters = this.app.voterService.getVotersForParcel(feature.properties.MASTER_ADDRESS_ID);
                            voterCount += voters.length;
                        }
                    }
                }
                
                const div = document.createElement('div');
                div.className = `turf-item ${isSelected ? 'selected' : ''} ${isEditing ? 'editing' : ''} ${turf.locked ? 'locked' : ''}`;

                if (isEditing) {
                    div.innerHTML = `
                        <div class="edit-form">
                            <input type="text" id="edit_name_${name}" value="${name}" placeholder="Turf name">
                            <div style="display: flex; align-items: center; gap: 10px; margin-top: 8px;">
                                <input type="color" id="edit_color_${name}" value="${turf.color}">
                                <span style="font-size: 0.8em;">Color</span>
                            </div>
                            <div class="edit-form-buttons">
                                <button class="btn btn-primary btn-small" onclick="app.saveEdit('${name}')">Save</button>
                                <button class="btn btn-secondary btn-small" onclick="app.cancelEdit()">Cancel</button>
                            </div>
                        </div>
                    `;
                } else {
                    div.dataset.turf = name;
                    
                    let statsText = `${visibleParcelCount} parcel${visibleParcelCount !== 1 ? 's' : ''}`;
                    if (this.app.voterDataLoaded && voterCount > 0) {
                        statsText += ` • ${voterCount} voter${voterCount !== 1 ? 's' : ''}`;
                    }
                    if (hasActiveFilters) {
                        statsText += ' visible';
                    } else {
                        statsText += ' assigned';
                    }
                    statsText += filterNote;
                    if (isSelected) {
                        statsText += ' • Currently selected';
                    }
                    
                    const lockIcon = turf.locked ? '🔒' : '🔓';
                    const lockTitle = turf.locked ? 'Unlock turf' : 'Lock turf';

                    div.innerHTML = `
                        <div class="turf-header">
                            <div>
                                <span class="color-indicator" data-action="edit-color" data-turf="${name}" style="background-color: ${turf.color}; cursor: ${turf.locked ? 'not-allowed' : 'pointer'};" title="${turf.locked ? 'Locked - cannot edit' : 'Click to edit color'}"></span>
                                <span class="turf-name">${name}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <span class="turf-count">${visibleParcelCount}${filterNote}</span>
                                <button class="lock-btn" data-action="toggle-lock" data-turf="${name}" title="${lockTitle}">${lockIcon}</button>
                                <button class="edit-btn ${turf.locked ? 'disabled' : ''}" data-action="edit" data-turf="${name}" title="${turf.locked ? 'Locked - cannot edit' : 'Edit turf'}">✏️</button>
                                <button class="delete-btn ${turf.locked ? 'disabled' : ''}" data-action="delete" data-turf="${name}" title="${turf.locked ? 'Locked - cannot delete' : 'Delete turf'}">✕</button>
                            </div>
                        </div>
                        <div class="turf-stats">
                            ${statsText}
                        </div>
                    `;
                }
                
                fragment.appendChild(div);
            }
        }
        
        container.innerHTML = '';
        container.appendChild(fragment);
        
        this.attachTurfEventListeners();
        this.bindTurfCreationEvents();
        this.debouncedUpdateBulkAssignment();
    }

    bindTurfCreationEvents() {
        const addButton = document.getElementById('addTurf');
        const nameInput = document.getElementById('turfName');
        
        if (addButton && nameInput) {
            addButton.replaceWith(addButton.cloneNode(true));
            nameInput.replaceWith(nameInput.cloneNode(true));
            
            const newAddButton = document.getElementById('addTurf');
            const newNameInput = document.getElementById('turfName');
            
            newAddButton.addEventListener('click', () => {
                log('Add turf button clicked');
                this.app.addTurf();
            });
            
            newNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    log('Enter pressed in turf name input');
                    this.app.addTurf();
                }
            });

            log('Turf creation events bound');
        }

        // Bind Lock All / Unlock All button events
        const lockAllButton = document.getElementById('lockAllTurfs');
        const unlockAllButton = document.getElementById('unlockAllTurfs');

        if (lockAllButton) {
            lockAllButton.addEventListener('click', () => {
                this.app.lockAllTurfs();
            });
        }

        if (unlockAllButton) {
            unlockAllButton.addEventListener('click', () => {
                this.app.unlockAllTurfs();
            });
        }
    }

    attachTurfEventListeners() {
        const container = document.getElementById('turfsList');
        
        if (this.handleTurfClick) {
            container.removeEventListener('click', this.handleTurfClick);
        }
        
        const self = this;
        this.handleTurfClick = function(e) {
            const target = e.target;

            if (target.dataset.action === 'toggle-lock') {
                e.stopPropagation();
                const name = target.dataset.turf;
                self.app.toggleTurfLock(name);
            } else if (target.dataset.action === 'edit') {
                e.stopPropagation();
                const name = target.dataset.turf;
                self.app.startEdit(name);
            } else if (target.dataset.action === 'edit-color') {
                e.stopPropagation();
                const name = target.dataset.turf;
                self.app.startEdit(name);
            } else if (target.dataset.action === 'delete') {
                e.stopPropagation();
                const name = target.dataset.turf;
                self.app.deleteTurf(name);
            } else if (target.closest('.turf-item') && !target.closest('.edit-form') && !target.closest('.turf-creation')) {
                const item = target.closest('.turf-item');
                const name = item.dataset.turf;
                if (name) {
                    self.app.selectTurf(name);
                }
            }
        };
        
        container.addEventListener('click', this.handleTurfClick);
    }

    showStatus(message, type = 'success') {
        if (this.statusTimeout) {
            clearTimeout(this.statusTimeout);
            this.statusTimeout = null;
        }
        
        const statusDiv = document.getElementById('statusMessage');
        statusDiv.innerHTML = `<div class="status-message status-${type}">${message}</div>`;
        
        if (!message.includes('<') && type !== 'error') {
            this.statusTimeout = setTimeout(() => {
                statusDiv.innerHTML = '';
                this.statusTimeout = null;
            }, 5000);
        }
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    createMultiSelectControls() {
        const container = document.getElementById('multiSelectContent');
        if (!container) return;

        const selectedCount = this.app.selectedParcels.size;
        const mode = this.app.selectionMode;

        let html = `
            <div style="margin-bottom: 10px;">
                <label style="font-size: 0.9em; margin-bottom: 5px; display: block;">Selection Mode:</label>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px;">
                    <button onclick="app.setSelectionMode('single')"
                            class="btn ${mode === 'single' ? 'btn-primary' : 'btn-secondary'}"
                            style="padding: 6px; font-size: 0.85em;">
                        Single
                    </button>
                    <button onclick="app.setSelectionMode('rectangle')"
                            class="btn ${mode === 'rectangle' ? 'btn-primary' : 'btn-secondary'}"
                            style="padding: 6px; font-size: 0.85em;">
                        Rectangle
                    </button>
                    <button onclick="app.setSelectionMode('brush')"
                            class="btn ${mode === 'brush' ? 'btn-primary' : 'btn-secondary'}"
                            style="padding: 6px; font-size: 0.85em;">
                        Brush
                    </button>
                </div>
            </div>
        `;

        if (mode === 'brush') {
            html += `
                <div style="margin-bottom: 10px;">
                    <label style="font-size: 0.85em; display: block; margin-bottom: 4px;">
                        Brush Radius: <span id="brushRadiusValue">${this.app.brushRadius}m</span>
                    </label>
                    <input type="range" min="100" max="1000" value="${this.app.brushRadius}"
                           oninput="app.setBrushRadius(this.value); document.getElementById('brushRadiusValue').textContent = this.value + 'm'"
                           style="width: 100%;">
                </div>
            `;
        }

        if (selectedCount > 0) {
            html += `
                <div style="background: #e6f3ff; padding: 10px; border-radius: 6px; margin-bottom: 10px;">
                    <strong>${selectedCount} point${selectedCount !== 1 ? 's' : ''} selected</strong>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
                    <button onclick="app.assignSelectedParcels()" class="btn btn-primary" style="font-size: 0.85em;">
                        Assign to Turf
                    </button>
                    <button onclick="app.clearSelection()" class="btn btn-secondary" style="font-size: 0.85em;">
                        Clear
                    </button>
                </div>
            `;
        } else if (mode !== 'single') {
            html += `<p style="font-size: 0.85em; color: #666; margin: 10px 0;">
                ${mode === 'rectangle' ? 'Click and drag to select an area' : 'Click and drag to paint selection'}
            </p>`;
        }

        container.innerHTML = html;
    }

    toggleMultiSelect() {
        this.app.multiSelectExpanded = !this.app.multiSelectExpanded;
        const content = document.getElementById('multiSelectContent');
        const toggle = document.getElementById('multiSelectToggle');

        if (this.app.multiSelectExpanded) {
            content.classList.add('expanded');
            toggle.classList.add('expanded');
        } else {
            content.classList.remove('expanded');
            toggle.classList.remove('expanded');
        }
    }
}
