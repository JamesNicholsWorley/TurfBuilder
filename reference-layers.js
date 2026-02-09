class ReferenceLayerManager {
    constructor(app) {
        this.app = app;
        this.referenceLayers = new Map();
        this.layerConfigs = new Map();
        this.editingLayer = null;
        
        // Define available reference layers - CONFIGURE YOUR SHAPEFILES HERE
        this.availableLayers = this.defineAvailableLayers();
        
        // Track which layers are currently loaded and visible
        this.loadedLayers = new Set();
        this.visibleLayers = new Set();
    }

    defineAvailableLayers() {
        // CONFIGURATION: Add your shapefile configurations here
        // Format: 'layer_id': { shapefileName: 'filename_without_extension', nameField: 'FIELD_NAME', ... }
        return {
            'historic_inventory': {
                name: 'Historic Inventory',
                description: 'Massachusetts Cultural Resources',
                shapefileName: 'MHCINV_POLY',  // Will look for MHCINV_POLY.shp, .shx, .dbf
                nameField: 'HISTORIC_N',  // Field containing the feature name
                type: 'polygon',
                defaultStyle: {
                    color: '#8B4513',
                    fillColor: '#D2B48C',
                    weight: 2,
                    opacity: 0.8,
                    fillOpacity: 0.3
                }
            }
        };
        
        // TO ADD A NEW LAYER:
        // 1. Add a new entry above with your shapefile name and name field
        // 2. Place your .shp, .shx, .dbf files in the same directory as this HTML file
        // 3. The system will automatically detect and load them
    }

    createReferenceLayerControls() {
        const container = document.getElementById('referenceLayersList');
        if (!container) return;
        
        let html = '';
        
        if (Object.keys(this.availableLayers).length === 0) {
            html = '<div style="margin-bottom: 15px; font-size: 0.9em; color: #666; text-align: center; font-style: italic;">No reference layers configured</div>';
        } else {
            Object.entries(this.availableLayers).forEach(([layerId, layerConfig]) => {
                const isVisible = this.visibleLayers.has(layerId);
                const isEditing = this.editingLayer === layerId;
                const currentConfig = this.layerConfigs.get(layerId) || layerConfig;
                
                html += `
                    <div class="reference-layer-item" data-layer-id="${layerId}">
                        <div class="reference-layer-header">
                            <div class="reference-layer-toggle">
                                <input type="checkbox" id="layer_${layerId}" ${isVisible ? 'checked' : ''} 
                                       onchange="app.referenceLayerManager.toggleLayer('${layerId}', this.checked)">
                                <label for="layer_${layerId}"><strong>${currentConfig.name}</strong></label>
                            </div>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                ${isVisible ? `<button class="edit-btn" onclick="app.referenceLayerManager.startEdit('${layerId}')" title="Edit layer style">✏️</button>` : ''}
                            </div>
                        </div>
                        <div style="font-size: 0.85em; color: #666; margin-bottom: 8px;">
                            ${currentConfig.description}
                        </div>
                `;
                
                if (isEditing) {
                    html += `
                        <div class="edit-form" style="margin-bottom: 10px;">
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
                                <div>
                                    <label style="font-size: 0.8em;">Fill Color:</label>
                                    <input type="color" id="edit_fillColor_${layerId}" value="${currentConfig.defaultStyle.fillColor || currentConfig.defaultStyle.color}" 
                                           style="width: 100%; height: 30px;">
                                </div>
                                <div>
                                    <label style="font-size: 0.8em;">Outline Color:</label>
                                    <input type="color" id="edit_outlineColor_${layerId}" value="${currentConfig.defaultStyle.color}" 
                                           style="width: 100%; height: 30px;">
                                </div>
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
                                <div>
                                    <label style="font-size: 0.8em;">Transparency: <span id="transparency_${layerId}_display">${Math.round((1 - (currentConfig.defaultStyle.fillOpacity || 0.5)) * 100)}%</span></label>
                                    <input type="range" id="edit_transparency_${layerId}" min="0" max="90" step="10" 
                                           value="${Math.round((1 - (currentConfig.defaultStyle.fillOpacity || 0.5)) * 100)}"
                                           oninput="document.getElementById('transparency_${layerId}_display').textContent = this.value + '%'"
                                           style="width: 100%;">
                                </div>
                                <div>
                                    <label style="font-size: 0.8em;">Line Weight: <span id="weight_${layerId}_display">${currentConfig.defaultStyle.weight || 2}</span></label>
                                    <input type="range" id="edit_weight_${layerId}" min="1" max="5" step="1" 
                                           value="${currentConfig.defaultStyle.weight || 2}"
                                           oninput="document.getElementById('weight_${layerId}_display').textContent = this.value"
                                           style="width: 100%;">
                                </div>
                            </div>
                            <div class="edit-form-buttons">
                                <button class="btn btn-primary btn-small" onclick="app.referenceLayerManager.saveEdit('${layerId}')">Save</button>
                                <button class="btn btn-secondary btn-small" onclick="app.referenceLayerManager.cancelEdit()">Cancel</button>
                            </div>
                        </div>
                    `;
                }
                
                html += '</div>';
            });
        }
        
        container.innerHTML = html;
    }

    startEdit(layerId) {
        if (this.editingLayer) {
            this.cancelEdit();
        }
        this.editingLayer = layerId;
        this.createReferenceLayerControls();
    }

    saveEdit(layerId) {
        const fillColorInput = document.getElementById(`edit_fillColor_${layerId}`);
        const outlineColorInput = document.getElementById(`edit_outlineColor_${layerId}`);
        const transparencyInput = document.getElementById(`edit_transparency_${layerId}`);
        const weightInput = document.getElementById(`edit_weight_${layerId}`);
        
        if (!fillColorInput || !outlineColorInput || !transparencyInput || !weightInput) return;
        
        const layerConfig = this.layerConfigs.get(layerId) || this.availableLayers[layerId];
        
        // Update style
        const newStyle = {
            ...layerConfig.defaultStyle,
            fillColor: fillColorInput.value,
            color: outlineColorInput.value,
            fillOpacity: 1 - (parseInt(transparencyInput.value) / 100),
            weight: parseInt(weightInput.value)
        };
        
        // Update stored config
        const updatedConfig = { ...layerConfig, defaultStyle: newStyle };
        this.layerConfigs.set(layerId, updatedConfig);
        
        // Apply to map layer
        this.applyStyleToLayer(layerId, newStyle);
        
        this.editingLayer = null;
        this.createReferenceLayerControls();
        this.app.uiManager.showStatus('Reference layer style updated!', 'success');
    }

    cancelEdit() {
        this.editingLayer = null;
        this.createReferenceLayerControls();
    }

    applyStyleToLayer(layerId, style) {
        const layer = this.referenceLayers.get(layerId);
        const layerConfig = this.availableLayers[layerId];
        
        if (!layer || !layerConfig) return;
        
        if (layerConfig.type === 'point') {
            layer.eachLayer(sublayer => {
                sublayer.setStyle(style);
            });
        } else {
            layer.setStyle(style);
        }
    }

    async toggleLayer(layerId, visible) {
        try {
            if (visible) {
                await this.loadLayer(layerId);
                this.showLayer(layerId);
            } else {
                this.hideLayer(layerId);
            }
            
            // Update controls
            this.createReferenceLayerControls();
            
        } catch (error) {
            error('Error toggling layer:', layerId, error);
            this.app.uiManager.showStatus(`Error loading ${layerId}: ${error.message}`, 'error');
            
            // Uncheck the checkbox on error
            const checkbox = document.getElementById(`layer_${layerId}`);
            if (checkbox) checkbox.checked = false;
        }
    }

    async loadLayer(layerId) {
        if (this.loadedLayers.has(layerId)) {
            return; // Already loaded
        }
        
        const layerConfig = this.availableLayers[layerId];
        if (!layerConfig) {
            throw new Error(`Unknown layer: ${layerId}`);
        }
        
        this.app.uiManager.showStatus(`Loading ${layerConfig.name}...`, 'loading');
        
        try {
            // Try to load from local shapefile
            const geojson = await this.loadShapefileFromFiles(layerConfig.shapefileName);
            
            // Create Leaflet layer
            const leafletLayer = this.createLeafletLayer(layerId, geojson, layerConfig);
            
            // Store the layer
            this.referenceLayers.set(layerId, leafletLayer);
            this.loadedLayers.add(layerId);
            
            log(`Loaded ${layerId}: ${geojson.features ? geojson.features.length : 0} features`);
            
        } catch (error) {
            error('Failed to load layer:', layerId, error);
            throw new Error(`Could not load ${layerConfig.name}. Please ensure ${layerConfig.shapefileName}.shp, .shx, and .dbf files are available.`);
        }
    }

    async loadShapefileFromFiles(shapefileName) {
        // Try to load the shapefile components
        const extensions = ['shp', 'shx', 'dbf', 'prj'];
        const files = {};
        
        for (const ext of extensions) {
            try {
                const response = await fetch(`${shapefileName}.${ext}`);
                if (response.ok) {
                    if (ext === 'prj') {
                        files[ext] = await response.text();
                    } else {
                        files[ext] = await response.arrayBuffer();
                    }
                }
            } catch (error) {
                if (ext !== 'prj') { // .prj is optional
                    log(`Could not load ${shapefileName}.${ext}:`, error);
                }
            }
        }
        
        // Check for required files
        if (!files.shp || !files.shx || !files.dbf) {
            throw new Error(`Missing required shapefile components for ${shapefileName}`);
        }
        
        // Use shpjs to parse the shapefile
        if (typeof window.shp === 'undefined') {
            throw new Error('Shapefile parser not loaded. Please include shpjs library.');
        }
        
        return await window.shp(files);
    }

    createLeafletLayer(layerId, geojsonData, layerConfig) {
        const currentConfig = this.layerConfigs.get(layerId) || layerConfig;
        const style = { ...currentConfig.defaultStyle };
        
        if (layerConfig.type === 'point') {
            return L.geoJSON(geojsonData, {
                pointToLayer: (feature, latlng) => {
                    return L.circleMarker(latlng, style);
                },
                onEachFeature: (feature, layer) => {
                    this.addPopupToLayer(feature, layer, layerConfig);
                }
            });
        } else {
            return L.geoJSON(geojsonData, {
                style: () => style,
                onEachFeature: (feature, layer) => {
                    this.addPopupToLayer(feature, layer, layerConfig);
                }
            });
        }
    }

    addPopupToLayer(feature, layer, layerConfig) {
        const props = feature.properties;
        let popupContent = `<div style="max-width: 250px;"><strong>${layerConfig.name}</strong><br>`;
        
        // Show the name field if it exists
        if (layerConfig.nameField && props[layerConfig.nameField]) {
            popupContent += `<strong>Name:</strong> ${props[layerConfig.nameField]}<br>`;
        }
        
        // Show a few other interesting fields
        const interestingFields = Object.keys(props).filter(field => 
            field !== layerConfig.nameField && 
            props[field] !== null && 
            props[field] !== undefined && 
            props[field] !== ''
        ).slice(0, 5);
        
        interestingFields.forEach(field => {
            popupContent += `<strong>${field}:</strong> ${props[field]}<br>`;
        });
        
        popupContent += '</div>';
        layer.bindPopup(popupContent);
    }

    showLayer(layerId) {
        const layer = this.referenceLayers.get(layerId);
        if (layer && !this.visibleLayers.has(layerId)) {
            layer.addTo(this.app.map);
            this.visibleLayers.add(layerId);
            log(`Showing layer: ${layerId}`);
        }
    }

    hideLayer(layerId) {
        const layer = this.referenceLayers.get(layerId);
        if (layer && this.visibleLayers.has(layerId)) {
            this.app.map.removeLayer(layer);
            this.visibleLayers.delete(layerId);
            log(`Hiding layer: ${layerId}`);
        }
    }

    updateLayerStyle(layerId, styleProperty, value) {
        const layer = this.referenceLayers.get(layerId);
        const layerConfig = this.availableLayers[layerId];
        
        if (!layer || !layerConfig) return;
        
        // Update the default style for future use
        const currentStyle = { ...layerConfig.defaultStyle };
        
        switch (styleProperty) {
            case 'color':
                if (layerConfig.type === 'point') {
                    currentStyle.fillColor = value;
                } else {
                    currentStyle.fillColor = value;
                }
                break;
            case 'opacity':
                if (layerConfig.type === 'point') {
                    currentStyle.fillOpacity = parseFloat(value);
                } else if (layerConfig.type === 'line') {
                    currentStyle.opacity = parseFloat(value);
                } else {
                    currentStyle.fillOpacity = parseFloat(value);
                }
                break;
            case 'outlineColor':
                currentStyle.color = value;
                break;
            case 'weight':
                currentStyle.weight = parseInt(value);
                break;
        }
        
        // Update the stored style
        layerConfig.defaultStyle = currentStyle;
        
        // Apply new style to the layer
        if (layerConfig.type === 'point') {
            layer.eachLayer(sublayer => {
                sublayer.setStyle(currentStyle);
            });
        } else {
            layer.setStyle(currentStyle);
        }
        
        log(`Updated ${layerId} style:`, styleProperty, '=', value);
    }

    clearAllLayers() {
        // Remove all visible layers from map
        this.visibleLayers.forEach(layerId => {
            this.hideLayer(layerId);
        });
        
        // Clear all layer data
        this.referenceLayers.clear();
        this.loadedLayers.clear();
        this.visibleLayers.clear();
        this.layerConfigs.clear();
        
        // Update UI
        this.createReferenceLayerControls();
        
        log('All reference layers cleared');
    }

    getLayerInfo(layerId) {
        return this.availableLayers[layerId] || null;
    }

    isLayerVisible(layerId) {
        return this.visibleLayers.has(layerId);
    }

    isLayerLoaded(layerId) {
        return this.loadedLayers.has(layerId);
    }

    getVisibleLayerCount() {
        return this.visibleLayers.size;
    }

    getAvailableLayerIds() {
        return Object.keys(this.availableLayers);
    }

    // Method to refresh layers when parcel data changes
    async refreshLayersForNewData() {
        if (this.visibleLayers.size === 0) return;
        
        const visibleLayerIds = Array.from(this.visibleLayers);
        
        // Keep reference layers visible - they don't need to be filtered by town
        log(`Reference layers remain visible for new parcel data: ${visibleLayerIds.length} layers`);
    }
}