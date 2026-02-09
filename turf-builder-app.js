class TurfBuilder {
    constructor() {
        log('TurfBuilder constructor called');
        
        // Core state
        this.map = null;
        this.parcelsLayer = null;
        this.turfs = new Map();  // CHANGED: neighborhoods → turfs
        this.selectedTurf = null;  // CHANGED: selectedNeighborhood → selectedTurf
        this.parcelData = null;
        this.parcelDataLoaded = false;
        this.mapBoundsSet = false;
        this.hoveredParcel = null;
        this.clickedParcel = null;
        this.availableFields = [];
        this.displayFields = [];
        this.baseLayers = {};
        this.currentBaseLayer = null;
        this.parcelOpacity = 0.7;
        this.activeFilters = new Map();
        this.filteredParcels = new Set();
        this.fieldStats = {};
        this.editingTurf = null;  // CHANGED: editingNeighborhood → editingTurf
        this.parcelIdField = 'MASTER_ADDRESS_ID';

        // NEW: Voter data
        this.voterData = null;  // Map of MASTER_ADDRESS_ID -> array of voters
        this.voterDataLoaded = false;
        this.voterSortBy = 'alphabetical';  // alphabetical, party, age
        this.showDebugFields = false;  // Toggle for parcel properties
        this.hideAddressesWithoutVoters = false;  // Hide addresses with no linked voters

        // Address clustering for multi-unit buildings
        this.addressClusters = new Map();  // "lat,lng" → {clusterKey, parcelIds: [], coordinates: [lat, lng]}
        this.clustersByParcelId = new Map();  // parcelId → clusterKey
        this.parcelFeatureMap = new Map();  // parcelId → feature (for fast lookup)

        // Multi-select state
        this.selectionMode = 'single';
        this.selectedParcels = new Set();
        this.brushRadius = 500; // meters
        this.brushing = false;
        this.multiSelectExpanded = false;

        // UI state for collapsible sections
        this.fieldsExpanded = false;
        this.dataManagementExpanded = false;
        this.filtersExpanded = false;
        this.bulkAssignmentExpanded = false;
        this.referenceLayersExpanded = false;
        this.voterImportExpanded = true;  // NEW: voter import section
        
        // Loading progress tracking
        this.loadingProgress = {
            currentTown: 0,
            totalTowns: 0,
            currentTownName: '',
            currentChunk: 0,
            totalChunks: 0,
            totalFeatures: 0,
            loadedFeatures: 0,
            phase: 'idle'
        };
        
        // Undo system
        this.undoState = null;
        this.undoDescription = '';
        
        // Selected towns
        this.selectedTownIds = [];
        this.selectedTownNames = [];
        
        // Visual settings
        this.colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
            '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
            '#10AC84', '#EE5A24', '#0984e3', '#6c5ce7', '#a29bfe'
        ];
        this.colorIndex = 0;
        
        try {
            // Initialize managers
            this.parcelService = new ParcelService(this);
            this.voterService = new VoterService(this);  // NEW
            this.referenceLayerManager = new ReferenceLayerManager(this);
            this.dataManager = new DataManager(this);
            this.uiManager = new UIManager(this);
            
            this.initMap();
            this.uiManager.showStatus('Ready! Select Massachusetts towns to load parcel data.', 'success');
            log('TurfBuilder initialized successfully');
        } catch (err) {
            error('Error in constructor:', err);
            throw err;
        }
    }

    initMap() {
        this.map = L.map('map').setView([42.3601, -71.0589], 8);
        
        this.baseLayers = {
            'carto': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                maxZoom: 19
            }),
            'osm': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                maxZoom: 19
            }),
            'esri': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: 'Tiles &copy; Esri',
                maxZoom: 18
            }),
            'topo': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
                attribution: 'Map data: &copy; OpenStreetMap contributors',
                maxZoom: 17
            })
        };
        
        this.currentBaseLayer = this.baseLayers['carto'];
        this.currentBaseLayer.addTo(this.map);
    }

    changeBaseLayer(layerKey) {
        if (this.currentBaseLayer) {
            this.map.removeLayer(this.currentBaseLayer);
        }
        this.currentBaseLayer = this.baseLayers[layerKey];
        this.currentBaseLayer.addTo(this.map);
    }

    updateOpacity(value) {
        this.parcelOpacity = value / 100;
        this.updateParcelStyles();
    }

    updateLoadingProgress(progress) {
        this.loadingProgress = { ...this.loadingProgress, ...progress };
        this.uiManager.updateProgressBar();
    }

    async loadSelectedTowns() {
        if (this.selectedTownNames.length === 0) {
            this.uiManager.showStatus('Please select at least one town', 'error');
            return;
        }

        try {
            this.updateLoadingProgress({
                currentTown: 0,
                totalTowns: this.selectedTownNames.length,
                phase: 'loading'
            });

            this.uiManager.showLoadingProgress();

            this.parcelData = await this.parcelService.loadTownsData(this.selectedTownNames);
            this.parcelDataLoaded = true;
            
            this.updateLoadingProgress({ phase: 'analyzing' });

            // Analyze fields
            this.analyzeFields();

            // Cluster overlapping address points
            this.analyzeAddressClusters();

            // Display parcels
            this.updateLoadingProgress({ phase: 'rendering' });
            this.displayParcels();
            
            this.updateLoadingProgress({ phase: 'complete' });
            this.uiManager.collapseDataLoadingSection();
            this.uiManager.updateFieldSelector();
            this.uiManager.createFilterControls();
            this.uiManager.createBulkAssignmentControls();
            this.uiManager.createMultiSelectControls();
            this.referenceLayerManager.createReferenceLayerControls();

            this.uiManager.hideLoadingProgress();
            
            const townText = this.selectedTownNames.length === 1 
                ? this.selectedTownNames[0] 
                : `${this.selectedTownNames.length} towns`;
            
            this.uiManager.showStatus(
                `Loaded ${this.parcelData.features.length} parcels from ${townText}. Now import voter data to continue.`, 
                'success'
            );
            
        } catch (err) {
            error('Error loading town data:', err);
            this.uiManager.hideLoadingProgress();
            this.uiManager.showStatus(`Error loading parcel data: ${err.message}`, 'error');
        }
    }

    analyzeFields() {
        if (!this.parcelData || !this.parcelData.features || this.parcelData.features.length === 0) {
            return;
        }

        // Get all available fields from parcels
        this.availableFields = Object.keys(this.parcelData.features[0].properties);

        // Set default display fields
        this.displayFields = [];
        if (this.availableFields.includes('STREET_NAME')) {
            this.displayFields = ['STREET_NAME', 'ADDRESS_NUMBER'];
        }

        // Analyze address point fields first
        this.dataManager.analyzeAddressPointFields();

        // Then analyze voter fields if loaded
        if (this.voterDataLoaded) {
            this.dataManager.analyzeVoterFieldTypes();
        }

        log('Available parcel fields:', this.availableFields);
        log('Display fields:', this.displayFields);
    }

    analyzeAddressClusters() {
        if (!this.parcelData?.features) return;

        this.addressClusters.clear();
        this.clustersByParcelId.clear();
        this.parcelFeatureMap.clear();

        // Group by rounded coordinates (6 decimal places ≈ 0.1m precision)
        this.parcelData.features.forEach(feature => {
            const parcelId = this.getParcelId(feature);
            const coords = feature.geometry.coordinates;
            const lat = coords[1].toFixed(6);
            const lng = coords[0].toFixed(6);
            const clusterKey = `${lat},${lng}`;

            // Store feature for fast lookup
            this.parcelFeatureMap.set(parcelId, feature);

            // Add to cluster
            if (!this.addressClusters.has(clusterKey)) {
                this.addressClusters.set(clusterKey, {
                    clusterKey,
                    parcelIds: [],
                    coordinates: [parseFloat(lat), parseFloat(lng)]
                });
            }

            this.addressClusters.get(clusterKey).parcelIds.push(parcelId);
            this.clustersByParcelId.set(parcelId, clusterKey);
        });

        log(`Address clustering complete: ${this.addressClusters.size} unique locations, ${this.parcelData.features.length} total parcels`);
    }

    // Voter data management
    async importVoterData(source, data) {
        try {
            if (!this.parcelDataLoaded) {
                throw new Error('Please load parcel data first');
            }
            
            this.uiManager.showStatus('Importing voter data...', 'loading');
            
            let voterImportResult;
            
            if (source === 'csv') {
                voterImportResult = await this.voterService.importFromCSV(data);
            } else if (source === 'googlesheets') {
                voterImportResult = await this.voterService.importFromGoogleSheets(data);
            } else {
                throw new Error('Unknown import source');
            }
            
            // Link voters to loaded parcels
            const linkage = this.voterService.linkVotersToLoadedParcels(voterImportResult);
            
            // Store voter data
            this.voterData = voterImportResult.votersByParcel;
            this.voterDataLoaded = true;

            // AUTO-ASSIGN: If voter CSV has "Turf" field, create turfs and auto-assign
            this.autoAssignFromVoterTurfs(voterImportResult);

            // Set default display fields
            const availableVoterFields = this.voterService.getAvailableVoterFields();
            const defaultFields = ['full_name', 'party', 'dob', 'precinct', 'election_count'];
            this.displayFields = defaultFields.filter(field => availableVoterFields.includes(field));

            // If no default fields found, use first 5 available fields
            if (this.displayFields.length === 0) {
                this.displayFields = availableVoterFields.slice(0, 5);
            }

            // Enable hiding addresses without voters by default
            this.hideAddressesWithoutVoters = true;

            // Analyze voter fields for filtering
            this.dataManager.analyzeVoterFieldTypes();

            // Update UI
            this.uiManager.updateFieldSelector();
            this.uiManager.createFilterControls();
            this.uiManager.createBulkAssignmentControls();

            // Apply voter filter (includes updateParcelStyles internally)
            this.applyVoterFilter();
            
            let message = `Imported ${voterImportResult.totalVoters} voters across ${voterImportResult.totalParcels} parcels. `;
            message += `Matched ${linkage.matched} parcels (${linkage.matchRate.toFixed(1)}%)`;
            
            if (linkage.unmatchedLocIds.length > 0) {
                message += `. Warning: ${linkage.unmatchedLocIds.length} MASTER_ADDRESS_IDs in voter file not found in loaded address points.`;
            }
            
            this.uiManager.showStatus(message, 'success');
            log('Voter import completed:', voterImportResult);
            
        } catch (err) {
            error('Error importing voter data:', err);
            this.uiManager.showStatus(`Error importing voter data: ${err.message}`, 'error');
        }
    }

    autoAssignFromVoterTurfs(voterImportResult) {
        // Check if any voter has a 'turf' field
        const hasTurfField = voterImportResult.voters.some(voter =>
            voter.turf && voter.turf.trim() !== ''
        );

        if (!hasTurfField) {
            log('No "Turf" field found in voter data, skipping auto-assignment');
            return;
        }

        log('Found "Turf" field in voter data, performing auto-assignment...');

        // Save undo state before making changes
        this.saveUndoState('Auto-assign addresses from CSV turf data');

        // Collect unique turf names from voter data
        const turfNames = new Set();
        voterImportResult.votersByParcel.forEach((voters, masterId) => {
            voters.forEach(voter => {
                if (voter.turf && voter.turf.trim() !== '') {
                    turfNames.add(voter.turf.trim());
                }
            });
        });

        log(`Found ${turfNames.size} unique turf names in voter data`);

        // Create turfs that don't exist yet
        turfNames.forEach(turfName => {
            if (!this.turfs.has(turfName)) {
                const newTurf = {
                    name: turfName,
                    parcels: new Set(),
                    color: this.colors[this.colorIndex % this.colors.length]
                };
                this.turfs.set(turfName, newTurf);
                this.colorIndex++;
                log(`Created new turf: "${turfName}"`);
            }
        });

        // Assign parcels to turfs based on voter data
        let assignedCount = 0;
        voterImportResult.votersByParcel.forEach((voters, masterId) => {
            // Get the turf name from the first voter with a turf field
            // (assuming all voters at an address belong to the same turf)
            const voterWithTurf = voters.find(v => v.turf && v.turf.trim() !== '');

            if (voterWithTurf) {
                const turfName = voterWithTurf.turf.trim();
                const turf = this.turfs.get(turfName);

                if (turf) {
                    // Find parcel ID(s) for this MASTER_ADDRESS_ID
                    // Handle both the feature and all clustered units
                    this.parcelData.features.forEach(feature => {
                        const featureMasterId = String(feature.properties.MASTER_ADDRESS_ID).trim();
                        const csvMasterId = String(masterId).trim();

                        if (featureMasterId === csvMasterId) {
                            const parcelId = this.getParcelId(feature);

                            // Also assign all parcels in the same cluster
                            const clusterKey = this.clustersByParcelId.get(parcelId);
                            const cluster = this.addressClusters.get(clusterKey);
                            const parcelIds = cluster ? cluster.parcelIds : [parcelId];

                            parcelIds.forEach(pid => {
                                // Remove from any existing turf first
                                this.turfs.forEach(t => t.parcels.delete(pid));

                                // Add to new turf
                                turf.parcels.add(pid);
                                assignedCount++;
                            });
                        }
                    });
                }
            }
        });

        log(`Auto-assigned ${assignedCount} addresses to turfs`);

        // Update UI to reflect assignments
        this.updateParcelStyles();
        this.uiManager.updateTurfsList();

        // Show notification
        this.uiManager.showStatus(
            `Auto-assigned ${assignedCount} addresses to ${turfNames.size} turf(s) from CSV data`,
            'success'
        );
    }

    // Bulk assignment functionality
    performBulkAssignment() {
        const targetTurf = document.getElementById('bulkAssignmentTarget').value;
        
        const conditions = new Map();
        
        // Get available fields to check (voter fields if loaded, otherwise parcel fields)
        const fieldsToCheck = this.voterDataLoaded 
            ? this.voterService.getAvailableVoterFields()
            : Object.keys(this.fieldStats);
        
        fieldsToCheck.forEach(field => {
            if (field === this.parcelIdField) return;
            
            const stats = this.fieldStats[field];
            if (!stats || stats.type === 'empty') return;
            
            if (stats.type === 'numeric') {
                const minEl = document.getElementById(`bulk_${field}_min`);
                const maxEl = document.getElementById(`bulk_${field}_max`);
                const min = minEl && minEl.value ? parseFloat(minEl.value) : null;
                const max = maxEl && maxEl.value ? parseFloat(maxEl.value) : null;
                
                if (min !== null || max !== null) {
                    conditions.set(field, { type: 'numeric', min, max });
                }
            } else {
                const container = document.getElementById(`bulk_${field}_checkboxes`);
                if (container) {
                    const selected = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
                        .map(checkbox => checkbox.value)
                        .filter(val => val !== '');
                    
                    if (selected.length > 0) {
                        conditions.set(field, { type: 'categorical', values: selected });
                    }
                }
            }
        });
        
        if (conditions.size === 0) {
            this.uiManager.showStatus('Please specify at least one condition for bulk assignment', 'error');
            return;
        }
        
        this.saveUndoState(`Bulk assign parcels to "${targetTurf || 'Unassigned'}" (${conditions.size} condition${conditions.size !== 1 ? 's' : ''})`);
        
        if (targetTurf && !this.turfs.has(targetTurf)) {
            const turf = {
                name: targetTurf,
                parcels: new Set(),
                color: this.colors[this.colorIndex % this.colors.length]
            };
            this.colorIndex++;
            this.turfs.set(targetTurf, turf);
        }
        
        let matchingParcels = [];
        
        this.parcelData.features.forEach(feature => {
            const parcelId = this.getParcelId(feature);
            let matches = true;
            
            for (const [field, condition] of conditions) {
                let fieldMatches = false;

                // FIRST: Check address point properties
                if (feature.properties.hasOwnProperty(field)) {
                    const value = feature.properties[field];

                    if (condition.type === 'numeric') {
                        const numValue = parseFloat(value);
                        if (!isNaN(numValue) &&
                            (condition.min === null || numValue >= condition.min) &&
                            (condition.max === null || numValue <= condition.max)) {
                            fieldMatches = true;
                        }
                    } else {
                        if (condition.values.includes(String(value))) {
                            fieldMatches = true;
                        }
                    }
                }

                // SECOND: If not in address props, check voter data
                if (!fieldMatches && this.voterDataLoaded) {
                    const voters = this.voterService.getVotersForParcel(feature.properties.MASTER_ADDRESS_ID);
                    if (voters.length > 0) {
                        // Check if ANY voter matches
                        fieldMatches = voters.some(voter => {
                            const voterValue = voter[field];
                            if (condition.type === 'numeric') {
                                const num = parseFloat(voterValue);
                                return !isNaN(num) &&
                                       (condition.min === null || num >= condition.min) &&
                                       (condition.max === null || num <= condition.max);
                            } else {
                                return condition.values.includes(String(voterValue));
                            }
                        });
                    }
                }

                if (!fieldMatches) {
                    matches = false;
                    break;
                }
            }
            
            if (matches) {
                matchingParcels.push(parcelId);
            }
        });
        
        if (matchingParcels.length === 0) {
            this.uiManager.showStatus('No parcels match the specified conditions', 'error');
            return;
        }
        
        matchingParcels.forEach(parcelId => {
            for (const [name, turf] of this.turfs) {
                turf.parcels.delete(parcelId);
            }
            
            if (targetTurf) {
                const targetT = this.turfs.get(targetTurf);
                if (targetT) {
                    targetT.parcels.add(parcelId);
                }
            }
        });
        
        this.updateParcelStyles();
        this.uiManager.updateTurfsList();
        
        const assignmentTarget = targetTurf || 'Unassigned';
        this.uiManager.showStatus(`Bulk assignment completed! ${matchingParcels.length} parcels assigned to "${assignmentTarget}"`, 'success');
        this.uiManager.showUndoNotification();
        
        log(`Bulk assignment: ${matchingParcels.length} parcels assigned to "${assignmentTarget}"`);
    }

    // Undo system methods
    saveUndoState(description) {
        try {
            const clonedTurfs = new Map();
            
            for (const [name, turf] of this.turfs) {
                clonedTurfs.set(name, {
                    name: turf.name,
                    parcels: new Set(turf.parcels),
                    color: turf.color
                });
            }
            
            this.undoState = {
                turfs: clonedTurfs,
                selectedTurf: this.selectedTurf,
                colorIndex: this.colorIndex
            };
            
            this.undoDescription = description || 'Unknown operation';
            log('Undo state saved:', this.undoDescription);
            
        } catch (err) {
            error('Failed to save undo state:', err);
        }
    }

    restoreUndoState() {
        if (!this.undoState) {
            this.uiManager.showStatus('No undo state available', 'error');
            return;
        }
        
        try {
            this.turfs.clear();
            
            for (const [name, turf] of this.undoState.turfs) {
                this.turfs.set(name, {
                    name: turf.name,
                    parcels: new Set(turf.parcels),
                    color: turf.color
                });
            }
            
            this.selectedTurf = this.undoState.selectedTurf;
            this.colorIndex = this.undoState.colorIndex;
            
            this.undoState = null;
            this.undoDescription = '';
            
            this.updateParcelStyles();
            this.uiManager.updateTurfsList();
            this.uiManager.hideUndoNotification();
            
            this.uiManager.showStatus('Undo completed successfully!', 'success');
            log('Undo state restored successfully');
            
        } catch (err) {
            error('Failed to restore undo state:', err);
            this.uiManager.showStatus('Error during undo operation', 'error');
        }
    }

    clearUndoState() {
        this.undoState = null;
        this.undoDescription = '';
        this.uiManager.hideUndoNotification();
    }

    displayParcels() {
        if (this.parcelsLayer) {
            this.map.removeLayer(this.parcelsLayer);
        }

        this.parcelsLayer = L.geoJSON(this.parcelData, {
            pointToLayer: (feature, latlng) => {
                const parcelId = this.getParcelId(feature);
                const style = this.getParcelStyle(parcelId);
                return L.circleMarker(latlng, style);
            },
            onEachFeature: (feature, layer) => {
                const parcelId = this.getParcelId(feature);

                layer._clickHandler = (e) => {
                    const clusterKey = this.clustersByParcelId.get(parcelId);
                    const cluster = this.addressClusters.get(clusterKey);
                    const parcelIds = cluster ? cluster.parcelIds : [parcelId];

                    // Store clicked info for all parcels in cluster
                    this.clickedParcel = { parcelId, feature, clusterKey, parcelIds };
                    this.uiManager.showParcelInfo(parcelId, feature);

                    if (this.selectionMode === 'single') {
                        if (this.selectedTurf) {
                            // Assign all units in cluster
                            this.saveUndoState(`Assign ${parcelIds.length} unit(s) to ${this.selectedTurf}`);
                            parcelIds.forEach(pid => {
                                const feat = this.parcelFeatureMap.get(pid);
                                if (feat) {
                                    this.toggleParcelAssignment(pid, feat);
                                }
                            });
                            this.uiManager.updateTurfsList();
                        } else {
                            this.uiManager.showStatus('Please select a turf first to assign address points', 'error');
                        }
                    } else {
                        // Multi-select: toggle all parcels in cluster
                        const allSelected = parcelIds.every(pid => this.selectedParcels.has(pid));
                        parcelIds.forEach(pid => {
                            if (allSelected) {
                                this.selectedParcels.delete(pid);
                            } else {
                                this.selectedParcels.add(pid);
                            }
                        });
                        this.updateSelectionHighlight();
                        this.uiManager.createMultiSelectControls();
                    }
                };

                layer._mouseoverHandler = (e) => {
                    if (this.hoveredParcel && this.hoveredParcel !== layer) {
                        const prevParcelId = this.getParcelId(this.hoveredParcel.feature);
                        this.hoveredParcel.setStyle(this.getParcelStyle(prevParcelId));
                    }

                    this.hoveredParcel = layer;

                    // Show info for entire cluster
                    const clusterKey = this.clustersByParcelId.get(parcelId);
                    const cluster = this.addressClusters.get(clusterKey);
                    if (cluster && cluster.parcelIds.length > 1) {
                        this.uiManager.showClusterInfo(cluster.parcelIds);
                    } else {
                        this.uiManager.showParcelInfo(parcelId, feature);
                    }

                    // Apply hover style (enlarge for visibility)
                    layer.setStyle({
                        ...this.getParcelStyle(parcelId),
                        radius: 8,
                        weight: 3
                    });
                };

                layer._mouseoutHandler = (e) => {
                    if (this.hoveredParcel === layer) {
                        this.hoveredParcel = null;
                    }
                    layer.setStyle(this.getParcelStyle(parcelId));

                    if (this.clickedParcel) {
                        this.uiManager.showParcelInfo(this.clickedParcel.parcelId, this.clickedParcel.feature);
                    } else {
                        this.uiManager.showDefaultParcelInfo();
                    }
                };

                layer.on('click', layer._clickHandler);
                layer.on('mouseover', layer._mouseoverHandler);
                layer.on('mouseout', layer._mouseoutHandler);

                layer._hasEvents = true;
            }
        }).addTo(this.map);

        if (!this.mapBoundsSet) {
            this.map.fitBounds(this.parcelsLayer.getBounds());
            this.mapBoundsSet = true;
        }

        log('Address points displayed with', this.parcelData.features.length, 'features');
    }

    getParcelStyle(parcelId) {
        const turf = this.findParcelTurf(parcelId);
        return {
            radius: 6,
            fillColor: turf ? turf.color : '#e2e8f0',
            color: turf ? turf.color : '#a0aec0',
            weight: 2,
            opacity: 1,
            fillOpacity: turf ? this.parcelOpacity : this.parcelOpacity * 0.5,
            stroke: true,
            fill: true
        };
    }

    getParcelId(feature) {
        if (feature._cachedParcelId !== undefined) {
            return feature._cachedParcelId;
        }
        
        const props = feature.properties;
        let id;
        
        if (this.parcelIdField && props[this.parcelIdField] !== undefined) {
            id = String(props[this.parcelIdField]);
        } else {
            if (!feature._consistent_id) {
                feature._consistent_id = `parcel_${Math.random().toString(36).substr(2, 9)}`;
            }
            id = feature._consistent_id;
        }
        
        feature._cachedParcelId = id;
        return id;
    }

    addTurf() {
        const nameInput = document.getElementById('turfName');
        const name = nameInput.value.trim();
        
        if (!name) {
            this.uiManager.showStatus('Please enter a turf name.', 'error');
            return;
        }

        if (this.turfs.has(name)) {
            this.uiManager.showStatus('A turf with this name already exists.', 'error');
            return;
        }

        const turf = {
            name: name,
            parcels: new Set(),
            color: this.colors[this.colorIndex % this.colors.length]
        };

        this.colorIndex++;
        this.turfs.set(name, turf);
        nameInput.value = '';
        
        this.selectedTurf = name;
        
        this.uiManager.updateTurfsList();
        this.uiManager.showStatus(`Turf "${name}" created and selected!`, 'success');
    }

    selectTurf(name) {
        if (this.editingTurf) {
            this.cancelEdit();
        }
        
        if (this.selectedTurf === name) {
            this.selectedTurf = null;
        } else {
            this.selectedTurf = name;
        }
        
        if (name === null) {
            this.clickedParcel = null;
            this.uiManager.showDefaultParcelInfo();
        }
        
        this.uiManager.updateTurfsList();
    }

    startEdit(name) {
        if (this.editingTurf) {
            this.cancelEdit();
        }
        this.editingTurf = name;
        this.uiManager.updateTurfsList();
    }

    saveEdit(name) {
        const nameInput = document.getElementById(`edit_name_${name}`);
        const colorInput = document.getElementById(`edit_color_${name}`);
        
        if (!nameInput || !colorInput) return;
        
        const newName = nameInput.value.trim();
        const newColor = colorInput.value;
        
        if (!newName) {
            this.uiManager.showStatus('Please enter a turf name.', 'error');
            return;
        }
        
        if (newName !== name && this.turfs.has(newName)) {
            this.uiManager.showStatus('A turf with this name already exists.', 'error');
            return;
        }
        
        const turf = this.turfs.get(name);
        
        if (newName !== name) {
            this.turfs.delete(name);
            turf.name = newName;
            this.turfs.set(newName, turf);
            
            if (this.selectedTurf === name) {
                this.selectedTurf = newName;
            }
        }
        
        turf.color = newColor;
        
        this.editingTurf = null;
        this.uiManager.updateTurfsList();
        this.updateParcelStyles();
        this.uiManager.showStatus('Turf updated successfully!', 'success');
    }

    cancelEdit() {
        this.editingTurf = null;
        this.uiManager.updateTurfsList();
    }

    deleteTurf(name) {
        if (confirm(`Are you sure you want to delete "${name}" turf?`)) {
            this.saveUndoState(`Delete turf "${name}"`);
            
            this.turfs.delete(name);
            if (this.selectedTurf === name) {
                this.selectedTurf = null;
            }
            if (this.editingTurf === name) {
                this.editingTurf = null;
            }
            this.uiManager.updateTurfsList();
            this.updateParcelStyles();
            this.uiManager.showStatus(`Turf "${name}" deleted.`, 'success');
            this.uiManager.showUndoNotification();
        }
    }

    toggleParcelAssignment(parcelId, feature) {
        if (!this.selectedTurf) {
            return;
        }

        const turf = this.turfs.get(this.selectedTurf);
        let currentTurf = null;
        
        for (const [name, t] of this.turfs) {
            if (t.parcels.has(parcelId)) {
                currentTurf = name;
                break;
            }
        }
        
        if (currentTurf === this.selectedTurf) {
            turf.parcels.delete(parcelId);
        } else {
            if (currentTurf) {
                this.turfs.get(currentTurf).parcels.delete(parcelId);
            }
            turf.parcels.add(parcelId);
        }

        if (this.clickedParcel && this.clickedParcel.parcelId === parcelId) {
            this.uiManager.showParcelInfo(parcelId, feature);
        }

        this.updateParcelStyles();
        this.uiManager.updateTurfsList();
    }

    findParcelTurf(parcelId) {
        for (const [name, turf] of this.turfs) {
            if (turf.parcels.has(parcelId)) {
                return turf;
            }
        }
        return null;
    }

    updateParcelStyles() {
        if (!this.parcelsLayer) return;
        
        const updates = [];
        
        this.parcelsLayer.eachLayer(layer => {
            const feature = layer.feature;
            const parcelId = this.getParcelId(feature);
            
            if (!this.filteredParcels.has(parcelId)) {
                updates.push({ layer, parcelId });
            }
        });
        
        requestAnimationFrame(() => {
            updates.forEach(({ layer, parcelId }) => {
                layer.setStyle(this.getParcelStyle(parcelId));
            });

            if (this.activeFilters.size > 0 || this.hideAddressesWithoutVoters) {
                this.uiManager.applyFilters(false);
            }
        });
    }

    applyVoterFilter() {
        if (!this.parcelsLayer) return;

        this.uiManager.applyFilters(false);
    }

    toggleHideAddressesWithoutVoters() {
        this.hideAddressesWithoutVoters = !this.hideAddressesWithoutVoters;
        this.applyVoterFilter();

        const checkbox = document.getElementById('hideAddressesWithoutVoters');
        if (checkbox) {
            checkbox.checked = this.hideAddressesWithoutVoters;
        }

        // Refresh filter controls to maintain checkbox state
        this.uiManager.createFilterControls();

        const statusMsg = this.hideAddressesWithoutVoters
            ? 'Hiding addresses without voters'
            : 'Showing all addresses';
        this.uiManager.showStatus(statusMsg, 'success');
    }

    // Multi-select mode management
    setSelectionMode(mode) {
        log('Setting selection mode:', mode);

        this.map.off('mousedown mousemove mouseup mouseout');

        // Restore map defaults first
        this.map.dragging.enable();
        this.map.boxZoom.enable();

        this.selectionMode = mode;
        const mapEl = document.getElementById('map');

        if (mode === 'rectangle' || mode === 'brush') {
            // DISABLE dragging so the mouse can draw/paint without moving the map
            this.map.dragging.disable();
            this.map.boxZoom.disable(); 
            
            mapEl.style.cursor = mode === 'rectangle' ? 'crosshair' : 'pointer';
            
            if (mode === 'rectangle') this.initRectangleSelection();
            if (mode === 'brush') this.initBrushSelection();
        } else {
            mapEl.style.cursor = '';
        }

        this.uiManager.createMultiSelectControls();
    }

    setBrushRadius(radius) {
        this.brushRadius = parseInt(radius);
    }

    initRectangleSelection() {
        let startLatLng = null;
        let rectangleLayer = null;

        this.map.on('mousedown', (e) => {
            if (this.selectionMode !== 'rectangle') return;
            startLatLng = e.latlng;
            rectangleLayer = L.rectangle([startLatLng, startLatLng], {
                color: '#667eea',
                weight: 2,
                fillOpacity: 0.15
            }).addTo(this.map);
        });

        this.map.on('mousemove', (e) => {
            if (!startLatLng || !rectangleLayer) return;
            rectangleLayer.setBounds([startLatLng, e.latlng]);
        });

        this.map.on('mouseup', (e) => {
            if (!startLatLng || !rectangleLayer) return;

            const bounds = rectangleLayer.getBounds();
            let count = 0;

            this.parcelsLayer.eachLayer(layer => {
                const latLng = layer.getLatLng();
                if (bounds.contains(latLng)) {
                    const parcelId = this.getParcelId(layer.feature);
                    const clusterKey = this.clustersByParcelId.get(parcelId);
                    const cluster = this.addressClusters.get(clusterKey);
                    const parcelIds = cluster ? cluster.parcelIds : [parcelId];
                    parcelIds.forEach(pid => {
                        if (!this.selectedParcels.has(pid)) {
                            this.selectedParcels.add(pid);
                            count++;
                        }
                    });
                }
            });

            this.map.removeLayer(rectangleLayer);
            rectangleLayer = null;
            startLatLng = null;

            this.updateSelectionHighlight();
            this.uiManager.createMultiSelectControls();
            if (count > 0) {
                this.uiManager.showStatus(`${count} points added to selection`, 'success');
            }
        });
    }

    initBrushSelection() {
        let brushing = false;
        let brushCircle = null;

        this.map.on('mousemove', (e) => {
            // Update visual circle position
            if (!brushCircle) {
                brushCircle = L.circle(e.latlng, {
                    radius: this.brushRadius,
                    color: '#667eea',
                    fillOpacity: 0.1,
                    interactive: false
                }).addTo(this.map);
            } else {
                brushCircle.setLatLng(e.latlng);
                brushCircle.setRadius(this.brushRadius);
            }

            if (brushing) {
                this.selectParcelsInRadius(e.latlng);
            }
        });

        this.map.on('mousedown', (e) => {
            if (this.selectionMode !== 'brush') return;
            brushing = true;
            this.selectParcelsInRadius(e.latlng);
        });

        this.map.on('mouseup mouseout', () => {
            brushing = false;
            if (brushCircle) {
                this.map.removeLayer(brushCircle);
                brushCircle = null;
            }
        });
    }

    selectParcelsInRadius(centerLatLng) {
        let count = 0;
        this.parcelsLayer.eachLayer(layer => {
            const distance = centerLatLng.distanceTo(layer.getLatLng());
            if (distance <= this.brushRadius) {
                const parcelId = this.getParcelId(layer.feature);
                const clusterKey = this.clustersByParcelId.get(parcelId);
                const cluster = this.addressClusters.get(clusterKey);
                const parcelIds = cluster ? cluster.parcelIds : [parcelId];
                parcelIds.forEach(pid => {
                    if (!this.selectedParcels.has(pid)) {
                        this.selectedParcels.add(pid);
                        count++;
                    }
                });
            }
        });

        if (count > 0) {
            this.updateSelectionHighlight();
            this.uiManager.createMultiSelectControls();
        }
    }

    updateSelectionHighlight() {
        if (!this.parcelsLayer) return;

        this.parcelsLayer.eachLayer(layer => {
            const parcelId = this.getParcelId(layer.feature);

            // Skip filtered parcels to prevent making them visible
            if (this.filteredParcels.has(parcelId)) {
                return;
            }

            if (this.selectedParcels.has(parcelId)) {
                layer.setStyle({
                    ...this.getParcelStyle(parcelId),
                    color: '#667eea',
                    weight: 3,
                    fillOpacity: 0.9
                });
            } else {
                layer.setStyle(this.getParcelStyle(parcelId));
            }
        });
    }

    clearSelection() {
        this.selectedParcels.clear();
        this.updateSelectionHighlight();
        this.uiManager.createMultiSelectControls();
        this.uiManager.showStatus('Selection cleared', 'success');
    }

    assignSelectedParcels() {
        if (!this.selectedTurf) {
            this.uiManager.showStatus('Please select a turf first', 'error');
            return;
        }

        if (this.selectedParcels.size === 0) return;

        const count = this.selectedParcels.size;
        this.saveUndoState(`Assign ${count} points to ${this.selectedTurf}`);

        const turf = this.turfs.get(this.selectedTurf);
        this.selectedParcels.forEach(parcelId => {
            // Remove from all turfs
            for (const [, t] of this.turfs) {
                t.parcels.delete(parcelId);
            }
            // Add to selected turf
            turf.parcels.add(parcelId);
        });

        this.selectedParcels.clear();
        this.updateParcelStyles();
        this.updateSelectionHighlight();
        this.uiManager.updateTurfsList();
        this.uiManager.createMultiSelectControls();
        this.uiManager.showUndoNotification();
        this.uiManager.showStatus(`${count} points assigned to ${this.selectedTurf}`, 'success');
    }
}
