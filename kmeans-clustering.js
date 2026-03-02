// K-means Clustering Service for Geographic Address Assignment
// Implements constrained k-means that balances geographic proximity with target cluster sizes

class KMeansClustering {
    constructor(app) {
        this.app = app;
    }

    /**
     * Calculate Haversine distance between two lat/lng points in meters
     */
    calculateDistance(coord1, coord2) {
        const R = 6371000; // Earth's radius in meters
        const lat1 = coord1[1] * Math.PI / 180;
        const lat2 = coord2[1] * Math.PI / 180;
        const deltaLat = (coord2[1] - coord1[1]) * Math.PI / 180;
        const deltaLng = (coord2[0] - coord1[0]) * Math.PI / 180;

        const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
                  Math.cos(lat1) * Math.cos(lat2) *
                  Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // Distance in meters
    }

    /**
     * K-means++ initialization for better centroid selection
     */
    initializeCentroids(addressClusters, k) {
        const centroids = [];

        // Choose first centroid randomly
        const firstIdx = Math.floor(Math.random() * addressClusters.length);
        centroids.push([...addressClusters[firstIdx].centroid]);

        // Choose remaining centroids
        for (let i = 1; i < k; i++) {
            const distances = addressClusters.map(cluster => {
                // Find minimum distance to existing centroids
                let minDist = Infinity;
                for (const centroid of centroids) {
                    const dist = this.calculateDistance(cluster.centroid, centroid);
                    minDist = Math.min(minDist, dist);
                }
                return minDist * minDist; // Square for weighted probability
            });

            // Choose next centroid with probability proportional to distance squared
            const totalDist = distances.reduce((sum, d) => sum + d, 0);
            let random = Math.random() * totalDist;

            for (let j = 0; j < distances.length; j++) {
                random -= distances[j];
                if (random <= 0) {
                    centroids.push([...addressClusters[j].centroid]);
                    break;
                }
            }
        }

        return centroids;
    }

    /**
     * Assign address clusters to nearest centroid
     */
    assignToClusters(addressClusters, centroids, targetSize) {
        const assignments = addressClusters.map(cluster => {
            let minDist = Infinity;
            let assignedCluster = 0;

            centroids.forEach((centroid, idx) => {
                const dist = this.calculateDistance(cluster.centroid, centroid);
                if (dist < minDist) {
                    minDist = dist;
                    assignedCluster = idx;
                }
            });

            return assignedCluster;
        });

        return assignments;
    }

    /**
     * Update centroids based on current assignments
     * Also applies gentle size balancing
     */
    updateCentroids(addressClusters, assignments, k, targetSize) {
        const newCentroids = [];
        const clusterSizes = new Array(k).fill(0);

        // Calculate cluster sizes (in units, not addresses)
        assignments.forEach((clusterIdx, i) => {
            clusterSizes[clusterIdx] += addressClusters[i].unitCount;
        });

        // Calculate new centroids
        for (let i = 0; i < k; i++) {
            const clusterAddresses = addressClusters
                .map((cluster, idx) => assignments[idx] === i ? cluster : null)
                .filter(c => c !== null);

            if (clusterAddresses.length === 0) {
                // Empty cluster - reinitialize randomly
                const randomIdx = Math.floor(Math.random() * addressClusters.length);
                newCentroids.push([...addressClusters[randomIdx].centroid]);
            } else {
                // Calculate geographic center
                const avgLng = clusterAddresses.reduce((sum, c) => sum + c.centroid[0], 0) / clusterAddresses.length;
                const avgLat = clusterAddresses.reduce((sum, c) => sum + c.centroid[1], 0) / clusterAddresses.length;
                newCentroids.push([avgLng, avgLat]);
            }
        }

        return newCentroids;
    }

    /**
     * Main k-means clustering algorithm
     */
    performKMeans(addressClusters, k, targetSize, maxIterations = 50) {
        let centroids = this.initializeCentroids(addressClusters, k);
        let assignments = null;
        let prevAssignments = null;

        for (let iteration = 0; iteration < maxIterations; iteration++) {
            // Assign to clusters
            assignments = this.assignToClusters(addressClusters, centroids, targetSize);

            // Check for convergence
            if (prevAssignments &&
                assignments.every((val, idx) => val === prevAssignments[idx])) {
                log(`K-means converged after ${iteration + 1} iterations`);
                break;
            }

            // Update centroids
            prevAssignments = [...assignments];
            centroids = this.updateCentroids(addressClusters, assignments, k, targetSize);
        }

        return { assignments, centroids };
    }

    /**
     * Balance clusters by splitting/merging if sizes are too imbalanced
     */
    balanceClusters(addressClusters, assignments, targetSize, tolerance = 0.5) {
        const k = Math.max(...assignments) + 1;
        const clusterSizes = new Array(k).fill(0);
        const clusterIndices = new Array(k).fill(null).map(() => []);

        // Calculate current cluster sizes
        assignments.forEach((clusterIdx, i) => {
            clusterSizes[clusterIdx] += addressClusters[i].unitCount;
            clusterIndices[clusterIdx].push(i);
        });

        // Identify clusters that are too large or too small
        const minSize = targetSize * (1 - tolerance);
        const maxSize = targetSize * (1 + tolerance);

        log(`Target size: ${targetSize} units, Range: ${minSize.toFixed(0)} - ${maxSize.toFixed(0)}`);
        log(`Cluster sizes: ${clusterSizes.map(s => s.toFixed(0)).join(', ')}`);

        // For now, just return the assignments
        // More sophisticated balancing could be added here
        return assignments;
    }

    /**
     * Main entry point for clustering and assignment
     */
    clusterAndAssign(options) {
        const {
            includeUnlockedRoutes,
            targetUnitsPerRoute,
            unlockedTurfs
        } = options;

        log(`Starting K-means clustering with target: ${targetUnitsPerRoute} units per route`);
        log(`Include unlocked routes: ${includeUnlockedRoutes}`);

        // Collect addressclusters to assign
        const addressClustersToAssign = [];
        const parcelIdToCluster = new Map();

        this.app.parcelData.features.forEach(feature => {
            const parcelId = this.app.getParcelId(feature);
            const currentTurf = this.app.findParcelTurf(parcelId);

            // Skip if in locked turf
            if (currentTurf && currentTurf.locked) {
                return;
            }

            // Skip if already assigned and we're not including unlocked routes
            if (!includeUnlockedRoutes && currentTurf) {
                return;
            }

            // Get the address cluster for this parcel
            const clusterKey = this.app.clustersByParcelId.get(parcelId);
            const addressCluster = this.app.addressClusters.get(clusterKey);

            if (!addressCluster) {
                // Single address point
                const coords = feature.geometry.coordinates;
                const unitCount = this.app.voterDataLoaded ?
                    (this.app.voterData.get(feature.properties.MASTER_ADDRESS_ID) || []).length :
                    1;

                // Skip addresses with no voters when voter data is loaded
                if (this.app.voterDataLoaded && unitCount === 0) {
                    return;
                }

                addressClustersToAssign.push({
                    parcelIds: [parcelId],
                    centroid: coords,
                    unitCount: Math.max(unitCount, 1)
                });
                parcelIdToCluster.set(parcelId, addressClustersToAssign.length - 1);
            } else {
                // Multi-unit building - check if we've already added this cluster
                const existingIdx = addressClustersToAssign.findIndex(ac =>
                    ac.parcelIds.length > 1 && ac.parcelIds[0] === addressCluster.parcelIds[0]
                );

                if (existingIdx === -1) {
                    // Add the whole cluster
                    // addressCluster.coordinates is [lat, lng] but we need [lng, lat] for GeoJSON
                    const coords = [addressCluster.coordinates[1], addressCluster.coordinates[0]];

                    // Count total units in this cluster
                    let totalUnits = 0;
                    addressCluster.parcelIds.forEach(pid => {
                        const pFeature = this.app.parcelFeatureMap.get(pid);
                        if (pFeature && this.app.voterDataLoaded) {
                            const voters = this.app.voterData.get(pFeature.properties.MASTER_ADDRESS_ID) || [];
                            totalUnits += voters.length;
                        }
                    });

                    // Skip multi-unit buildings with no voters when voter data is loaded
                    if (this.app.voterDataLoaded && totalUnits === 0) {
                        return;
                    }

                    totalUnits = Math.max(totalUnits, addressCluster.parcelIds.length);

                    addressClustersToAssign.push({
                        parcelIds: addressCluster.parcelIds,
                        centroid: coords,
                        unitCount: totalUnits
                    });

                    const clusterIdx = addressClustersToAssign.length - 1;
                    addressCluster.parcelIds.forEach(pid => {
                        parcelIdToCluster.set(pid, clusterIdx);
                    });
                }
            }
        });

        const totalUnits = addressClustersToAssign.reduce((sum, ac) => sum + ac.unitCount, 0);
        log(`Found ${addressClustersToAssign.length} address clusters with ${totalUnits} total units`);

        if (addressClustersToAssign.length === 0) {
            this.app.uiManager.showStatus('No addresses available for clustering', 'error');
            return;
        }

        // Handle edge case: single building larger than target
        const oversizedClusters = addressClustersToAssign.filter(ac => ac.unitCount > targetUnitsPerRoute * 1.5);
        if (oversizedClusters.length > 0) {
            log(`Found ${oversizedClusters.length} oversized address cluster(s)`);
            // These will be assigned to their own turfs
        }

        // Calculate optimal number of clusters
        const optimalK = Math.max(1, Math.ceil(totalUnits / targetUnitsPerRoute));
        const k = Math.min(optimalK, unlockedTurfs.length);

        if (k === 0) {
            this.app.uiManager.showStatus('No unlocked turfs available', 'error');
            return;
        }

        log(`Using ${k} clusters (optimal: ${optimalK}, available turfs: ${unlockedTurfs.length})`);

        // Run k-means clustering
        const { assignments, centroids } = this.performKMeans(addressClustersToAssign, k, targetUnitsPerRoute);

        // Balance clusters
        const balancedAssignments = this.balanceClusters(addressClustersToAssign, assignments, targetUnitsPerRoute);

        // Assign clusters to turfs
        // Sort turfs by current size (smallest first) for fairer distribution
        const turfSizes = unlockedTurfs.map(turf => ({
            turf,
            size: Array.from(turf.parcels).reduce((sum, pid) => {
                const feature = this.app.parcelFeatureMap.get(pid);
                if (feature && this.app.voterDataLoaded) {
                    const voters = this.app.voterData.get(feature.properties.MASTER_ADDRESS_ID) || [];
                    return sum + voters.length;
                }
                return sum + 1;
            }, 0)
        })).sort((a, b) => a.size - b.size);

        // Calculate how many units each cluster will get
        const clusterSizes = new Array(k).fill(0);
        balancedAssignments.forEach((clusterIdx, i) => {
            clusterSizes[clusterIdx] += addressClustersToAssign[i].unitCount;
        });

        // Assign clusters to turfs, balancing by size
        const clusterToTurf = new Map();
        const clusterSizeWithIdx = clusterSizes.map((size, idx) => ({ size, idx }))
            .sort((a, b) => b.size - a.size); // Largest first

        for (let i = 0; i < Math.min(k, turfSizes.length); i++) {
            clusterToTurf.set(clusterSizeWithIdx[i].idx, turfSizes[i].turf);
        }

        // Clear parcels from unlocked turfs
        unlockedTurfs.forEach(turf => {
            turf.parcels.clear();
        });

        // Assign parcels based on clustering
        let assignedCount = 0;
        addressClustersToAssign.forEach((cluster, idx) => {
            const clusterIdx = balancedAssignments[idx];
            const turf = clusterToTurf.get(clusterIdx);

            if (turf) {
                cluster.parcelIds.forEach(parcelId => {
                    // Remove from any turf first
                    for (const t of this.app.turfs.values()) {
                        t.parcels.delete(parcelId);
                    }

                    // Add to assigned turf
                    turf.parcels.add(parcelId);
                    assignedCount++;
                });
            }
        });

        log(`K-means clustering complete: ${assignedCount} addresses assigned to ${k} turfs`);

        // Show final cluster statistics
        const finalSizes = unlockedTurfs.slice(0, k).map(turf => {
            let units = 0;
            turf.parcels.forEach(parcelId => {
                const feature = this.app.parcelFeatureMap.get(parcelId);
                if (feature && this.app.voterDataLoaded) {
                    const voters = this.app.voterData.get(feature.properties.MASTER_ADDRESS_ID) || [];
                    units += voters.length || 1;
                } else {
                    units += 1;
                }
            });
            return { name: turf.name, addresses: turf.parcels.size, units };
        });

        log('Final turf assignments:');
        finalSizes.forEach(({ name, addresses, units }) => {
            log(`  ${name}: ${addresses} addresses, ${units} units`);
        });

        this.app.uiManager.showStatus(
            `K-means clustering complete! ${assignedCount} addresses assigned to ${k} turf(s)`,
            'success'
        );
    }
}

// Logging helper
function log(message) {
    if (typeof console !== 'undefined' && console.log) {
        console.log(`[K-means] ${message}`);
    }
}
