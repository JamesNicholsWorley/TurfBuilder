class ParcelService {
    constructor(app) {
        this.app = app;
        this.serviceUrl = 'https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/MassGIS_Master_Address_Points/MapServer/0';
        this.chunkSize = 1000; // Maximum records per request

        // Massachusetts towns lookup table (town name -> TOWN_ID)
        this.massGisTowns = this.createTownLookup();
    }

    createTownLookup() {
        // Comprehensive Massachusetts towns lookup table
        // Based on MassGIS TOWN_ID values
        return {
            'Abington': 1, 'Acton': 2, 'Acushnet': 3, 'Adams': 4, 'Agawam': 5,
            'Alford': 6, 'Amesbury': 7, 'Amherst': 8, 'Andover': 9, 'Arlington': 10,
            'Ashburnham': 11, 'Ashby': 12, 'Ashfield': 13, 'Ashland': 14, 'Athol': 15,
            'Attleboro': 16, 'Auburn': 17, 'Avon': 18, 'Ayer': 19, 'Barnstable': 20,
            'Barre': 21, 'Becket': 22, 'Bedford': 23, 'Belchertown': 24, 'Bellingham': 25,
            'Belmont': 26, 'Berkley': 27, 'Berlin': 28, 'Bernardston': 29, 'Beverly': 30,
            'Billerica': 31, 'Blackstone': 32, 'Blandford': 33, 'Bolton': 34, 'Boston': 35,
            'Bourne': 36, 'Boxborough': 37, 'Boxford': 38, 'Boylston': 39, 'Braintree': 40,
            'Brewster': 41, 'Bridgewater': 42, 'Brimfield': 43, 'Brockton': 44, 'Brookfield': 45,
            'Brookline': 46, 'Buckland': 47, 'Burlington': 48, 'Cambridge': 49, 'Canton': 50,
            'Carlisle': 51, 'Carver': 52, 'Charlemont': 53, 'Charlton': 54, 'Chatham': 55,
            'Chelmsford': 56, 'Chelsea': 57, 'Cheshire': 58, 'Chester': 59, 'Chesterfield': 60,
            'Chicopee': 61, 'Chilmark': 62, 'Clarksburg': 63, 'Clinton': 64, 'Cohasset': 65,
            'Colrain': 66, 'Concord': 67, 'Conway': 68, 'Cummington': 69, 'Dalton': 70,
            'Danvers': 71, 'Dartmouth': 72, 'Dedham': 73, 'Deerfield': 74, 'Dennis': 75,
            'Dighton': 76, 'Douglas': 77, 'Dover': 78, 'Dracut': 79, 'Dudley': 80,
            'Dunstable': 81, 'Duxbury': 82, 'East Bridgewater': 83, 'East Brookfield': 84, 'East Longmeadow': 85,
            'Eastham': 86, 'Easthampton': 87, 'Easton': 88, 'Edgartown': 89, 'Egremont': 90,
            'Erving': 91, 'Essex': 92, 'Everett': 93, 'Fairhaven': 94, 'Fall River': 95,
            'Falmouth': 96, 'Fitchburg': 97, 'Florida': 98, 'Foxborough': 99, 'Framingham': 100,
            'Franklin': 101, 'Freetown': 102, 'Gardner': 103, 'Gay Head': 104, 'Georgetown': 105,
            'Gill': 106, 'Gloucester': 107, 'Goshen': 108, 'Gosnold': 109, 'Grafton': 110,
            'Granby': 111, 'Granville': 112, 'Great Barrington': 113, 'Greenfield': 114, 'Groton': 115,
            'Groveland': 116, 'Hadley': 117, 'Halifax': 118, 'Hamilton': 119, 'Hampden': 120,
            'Hancock': 121, 'Hanover': 122, 'Hanson': 123, 'Hardwick': 124, 'Harvard': 125,
            'Harwich': 126, 'Hatfield': 127, 'Haverhill': 128, 'Hawley': 129, 'Heath': 130,
            'Hingham': 131, 'Hinsdale': 132, 'Holbrook': 133, 'Holden': 134, 'Holland': 135,
            'Holliston': 136, 'Holyoke': 137, 'Hopedale': 138, 'Hopkinton': 139, 'Hubbardston': 140,
            'Hudson': 141, 'Hull': 142, 'Huntington': 143, 'Ipswich': 144, 'Kingston': 145,
            'Lakeville': 146, 'Lancaster': 147, 'Lanesborough': 148, 'Lawrence': 149, 'Lee': 150,
            'Leicester': 151, 'Lenox': 152, 'Leominster': 153, 'Leverett': 154, 'Lexington': 155,
            'Leyden': 156, 'Lincoln': 157, 'Littleton': 158, 'Longmeadow': 159, 'Lowell': 160,
            'Ludlow': 161, 'Lunenburg': 162, 'Lynn': 163, 'Lynnfield': 164, 'Malden': 165,
            'Manchester': 166, 'Mansfield': 167, 'Marblehead': 168, 'Marion': 169, 'Marlborough': 170,
            'Marshfield': 171, 'Mashpee': 172, 'Mattapoisett': 173, 'Maynard': 174, 'Medfield': 175,
            'Medford': 176, 'Medway': 177, 'Melrose': 178, 'Mendon': 179, 'Merrimac': 180,
            'Methuen': 181, 'Middleborough': 182, 'Middlefield': 183, 'Middleton': 184, 'Milford': 185,
            'Millbury': 186, 'Millis': 187, 'Millville': 188, 'Milton': 189, 'Monroe': 190,
            'Monson': 191, 'Montague': 192, 'Monterey': 193, 'Montgomery': 194, 'Mount Washington': 195,
            'Nahant': 196, 'Nantucket': 197, 'Natick': 198, 'Needham': 199, 'New Ashford': 200,
            'New Bedford': 201, 'New Braintree': 202, 'New Marlborough': 203, 'New Salem': 204, 'Newbury': 205,
            'Newburyport': 206, 'Newton': 207, 'Norfolk': 208, 'North Adams': 209, 'North Andover': 210,
            'North Attleborough': 211, 'North Brookfield': 212, 'North Reading': 213, 'Northampton': 214, 'Northborough': 215,
            'Northbridge': 216, 'Northfield': 217, 'Norton': 218, 'Norwell': 219, 'Norwood': 220,
            'Oak Bluffs': 221, 'Oakham': 222, 'Orange': 223, 'Orleans': 224, 'Otis': 225,
            'Oxford': 226, 'Palmer': 227, 'Paxton': 228, 'Peabody': 229, 'Pelham': 230,
            'Pembroke': 231, 'Pepperell': 232, 'Peru': 233, 'Petersham': 234, 'Phillipston': 235,
            'Pittsfield': 236, 'Plainfield': 237, 'Plainville': 238, 'Plymouth': 239, 'Plympton': 240,
            'Princeton': 241, 'Provincetown': 242, 'Quincy': 243, 'Randolph': 244, 'Raynham': 245,
            'Reading': 246, 'Rehoboth': 247, 'Revere': 248, 'Richmond': 249, 'Rochester': 250,
            'Rockland': 251, 'Rockport': 252, 'Rowe': 253, 'Rowley': 254, 'Royalston': 255,
            'Russell': 256, 'Rutland': 257, 'Salem': 258, 'Salisbury': 259, 'Sandisfield': 260,
            'Sandwich': 261, 'Saugus': 262, 'Savoy': 263, 'Scituate': 264, 'Seekonk': 265,
            'Sharon': 266, 'Sheffield': 267, 'Shelburne': 268, 'Sherborn': 269, 'Shirley': 270,
            'Shrewsbury': 271, 'Shutesbury': 272, 'Somerset': 273, 'Somerville': 274, 'South Hadley': 275,
            'Southampton': 276, 'Southborough': 277, 'Southbridge': 278, 'Southwick': 279, 'Spencer': 280,
            'Springfield': 281, 'Sterling': 282, 'Stockbridge': 283, 'Stoneham': 284, 'Stoughton': 285,
            'Stow': 286, 'Sturbridge': 287, 'Sudbury': 288, 'Sunderland': 289, 'Sutton': 290,
            'Swampscott': 291, 'Swansea': 292, 'Taunton': 293, 'Templeton': 294, 'Tewksbury': 295,
            'Tisbury': 296, 'Tolland': 297, 'Topsfield': 298, 'Townsend': 299, 'Truro': 300,
            'Tyngsborough': 301, 'Tyringham': 302, 'Upton': 303, 'Uxbridge': 304, 'Wakefield': 305,
            'Wales': 306, 'Walpole': 307, 'Waltham': 308, 'Ware': 309, 'Wareham': 310,
            'Warren': 311, 'Warwick': 312, 'Washington': 313, 'Watertown': 314, 'Wayland': 315,
            'Webster': 316, 'Wellesley': 317, 'Wellfleet': 318, 'Wendell': 319, 'Wenham': 320,
            'West Boylston': 321, 'West Bridgewater': 322, 'West Brookfield': 323, 'West Newbury': 324, 'West Springfield': 325,
            'West Stockbridge': 326, 'West Tisbury': 327, 'Westborough': 328, 'Westfield': 329, 'Westford': 330,
            'Westhampton': 331, 'Westminster': 332, 'Weston': 333, 'Westport': 334, 'Westwood': 335,
            'Weymouth': 336, 'Whately': 337, 'Whitman': 338, 'Wilbraham': 339, 'Williamsburg': 340,
            'Williamstown': 341, 'Wilmington': 342, 'Winchendon': 343, 'Winchester': 344, 'Windsor': 345,
            'Winthrop': 346, 'Woburn': 347, 'Worcester': 348, 'Worthington': 349, 'Wrentham': 350,
            'Yarmouth': 351
        };
    }


    searchTowns(searchTerm) {
        if (!searchTerm || searchTerm.length < 2) {
            return [];
        }
        
        const lowerSearch = searchTerm.toLowerCase();
        return Object.entries(this.massGisTowns)
            .filter(([name, id]) => name.toLowerCase().includes(lowerSearch))
            .sort((a, b) => {
                // Prioritize exact matches and matches at the beginning
                const aLower = a[0].toLowerCase();
                const bLower = b[0].toLowerCase();
                
                if (aLower === lowerSearch) return -1;
                if (bLower === lowerSearch) return 1;
                if (aLower.startsWith(lowerSearch) && !bLower.startsWith(lowerSearch)) return -1;
                if (bLower.startsWith(lowerSearch) && !aLower.startsWith(lowerSearch)) return 1;
                
                return a[0].localeCompare(b[0]);
            })
            .slice(0, 10) // Limit to 10 suggestions
            .map(([name, id]) => ({ name, id }));
    }

    async getTownParcelCount(townName) {
        try {
            const countQuery = {
                where: `GEOGRAPHIC_TOWN = '${townName.toUpperCase()}'`,
                returnCountOnly: true,
                f: 'json'
            };

            const response = await fetch(`${this.serviceUrl}/query?${new URLSearchParams(countQuery)}`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error.message);
            }

            return data.count || 0;
        } catch (error) {
            log('Error getting address point count for town', townName, ':', error);
            throw error;
        }
    }

    async loadTownData(townName) {
        try {
            log(`Loading data for town ${townName}...`);

            // First, get the total count
            const totalCount = await this.getTownParcelCount(townName);
            const chunksNeeded = Math.ceil(totalCount / this.chunkSize);

            log(`Town ${townName}: ${totalCount} address points, ${chunksNeeded} chunks needed`);

            // Update progress with chunk information
            this.app.updateLoadingProgress({
                currentTownName: townName,
                totalChunks: chunksNeeded,
                currentChunk: 0,
                totalFeatures: totalCount,
                loadedFeatures: 0
            });

            // Load all chunks
            const allFeatures = [];

            for (let i = 0; i < chunksNeeded; i++) {
                const offset = i * this.chunkSize;

                // Update chunk progress
                this.app.updateLoadingProgress({
                    currentChunk: i + 1,
                    loadedFeatures: offset
                });

                const chunkQuery = {
                    where: `GEOGRAPHIC_TOWN = '${townName.toUpperCase()}'`,
                    outFields: '*',
                    returnGeometry: true,
                    f: 'geojson',
                    outSR: 4326,
                    resultOffset: offset,
                    resultRecordCount: this.chunkSize
                };

                const chunkResponse = await fetch(`${this.serviceUrl}/query?${new URLSearchParams(chunkQuery)}`);

                if (!chunkResponse.ok) {
                    throw new Error(`Chunk ${i + 1} failed: HTTP ${chunkResponse.status}`);
                }

                const chunkData = await chunkResponse.json();

                if (chunkData.error) {
                    throw new Error(`Chunk ${i + 1} error: ${chunkData.error.message}`);
                }

                if (chunkData.features && chunkData.features.length > 0) {
                    allFeatures.push(...chunkData.features);

                    // Update progress with actual loaded features
                    this.app.updateLoadingProgress({
                        loadedFeatures: allFeatures.length
                    });

                    log(`Town ${townName} chunk ${i + 1}/${chunksNeeded}: loaded ${chunkData.features.length} features (total: ${allFeatures.length})`);
                }

                // Small delay between requests to be nice to the server
                if (i < chunksNeeded - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            return allFeatures;

        } catch (err) {
            error('Error loading town data for', townName, ':', err);
            throw err;
        }
    }

    async loadTownsData(townNames) {
        try {
            log(`Loading data for ${townNames.length} towns:`, townNames);

            let allFeatures = [];
            const rawFeatureCount = { total: 0 };

            // Update initial progress
            this.app.updateLoadingProgress({
                currentTown: 0,
                totalTowns: townNames.length,
                phase: 'loading'
            });

            // Load each town sequentially to avoid overwhelming the service
            for (let i = 0; i < townNames.length; i++) {
                const townName = townNames[i];

                // Update town progress
                this.app.updateLoadingProgress({
                    currentTown: i + 1,
                    currentTownName: townName
                });

                const townFeatures = await this.loadTownData(townName);
                allFeatures = allFeatures.concat(townFeatures);
                rawFeatureCount.total += townFeatures.length;

                log(`Town ${townName}: loaded ${townFeatures.length} features (running total: ${allFeatures.length})`);
            }

            // DEDUPLICATION: Remove overlapping address points by MASTER_ADDRESS_ID
            this.app.updateLoadingProgress({ phase: 'deduplicating' });
            log(`Raw features loaded: ${allFeatures.length}`);

            const uniqueAddresses = new Map();
            let duplicateCount = 0;

            allFeatures.forEach(feature => {
                const objectId = feature.properties.MASTER_ADDRESS_ID;
                if (objectId && !uniqueAddresses.has(objectId)) {
                    uniqueAddresses.set(objectId, feature);
                } else if (objectId) {
                    duplicateCount++;
                }
            });

            const uniqueFeatures = Array.from(uniqueAddresses.values());
            log(`After deduplication: ${uniqueFeatures.length} unique address points (removed ${duplicateCount} duplicates)`);

            // Combine all unique features into a single GeoJSON
            const geojsonData = {
                type: 'FeatureCollection',
                features: uniqueFeatures
            };

            // Update progress to complete
            this.app.updateLoadingProgress({ phase: 'complete' });

            log(`Final dataset: ${geojsonData.features.length} address points from ${townNames.length} towns`);
            return geojsonData;

        } catch (err) {
            error('Error loading towns data:', err);
            throw err;
        }
    }

    async testServiceConnection() {
        try {
            // Test service availability
            const serviceInfoUrl = this.serviceUrl.replace('/query', '');
            const serviceResponse = await fetch(`${serviceInfoUrl}?f=json`);
            
            if (!serviceResponse.ok) {
                throw new Error(`Service not accessible: ${serviceResponse.status}`);
            }
            
            const serviceInfo = await serviceResponse.json();
            log('MassGIS service info:', serviceInfo);
            
            // Test a simple query
            const testQuery = {
                where: "1=1",
                outFields: '*',
                returnGeometry: false,
                f: 'json',
                resultRecordCount: 1
            };
            
            const testResponse = await fetch(`${this.serviceUrl}/query?${new URLSearchParams(testQuery)}`);
            
            if (!testResponse.ok) {
                throw new Error(`Query failed: ${testResponse.status}`);
            }
            
            const testData = await testResponse.json();
            
            if (testData.error) {
                throw new Error(`Service error: ${testData.error.message}`);
            }
            
            if (testData.features && testData.features.length > 0) {
                const fields = Object.keys(testData.features[0].attributes);
                log('Available fields:', fields);
                
                return {
                    success: true,
                    fieldCount: fields.length,
                    hasObjectId: fields.includes('MASTER_ADDRESS_ID'),
                    hasStreetName: fields.includes('STREET_NAME')
                };
            }
            
            throw new Error('No test features returned');
            
        } catch (err) {
            error('Service test failed:', err);
            throw error;
        }
    }

    getTownIdByName(townName) {
        return this.massGisTowns[townName] || null;
    }

    getTownNameById(townId) {
        for (const [name, id] of Object.entries(this.massGisTowns)) {
            if (id === townId) return name;
        }
        return null;
    }

    getAllTownNames() {
        return Object.keys(this.massGisTowns).sort();
    }
}