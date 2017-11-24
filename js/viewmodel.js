var map;

var ViewModel = function () {
  var self = this;

  this.searchTerm = ko.observable('');

  this.stationsList = ko.observableArray([]);

  // Initialize Google Map object
  map = new google.maps.Map(document.getElementById('map'), {
    center: {lat: 37.6021349, lng: -122.275478},
    zoom: 10,
    styles: mapStyle,
    mapTypeControl: false
  });

  // Initialize Data
  data.stops.forEach(function(stop) {
    //JSON-to-Station mapping
    var station = new Station(stop);
    // Fetch Meetup data for each station
    station.findNearbyEvents();
    // Display all relevation markers
    station.showMarker();
    // Add listener for Station selection
    station.marker.addListener('click', function () {
      self.selectStation(station);
    });
    // Populate Station collection
    self.stationsList.push(station);
  });

  // Create Search Box for searchWithinTime input
  var searchBox = new google.maps.places.SearchBox(document.getElementById('search-within-time-text'));
  searchBox.setBounds(map.getBounds());

  // Toggle for Station Menu
  this.toggleStationsList = function() {
    $('.stations-box').slideToggle();
  };

  // Toggle for Filter Menu
  this.toggleFilterOptions = function() {
    $('.filter-options').slideToggle();
  };

  // Clear all set filters
  this.clearFilters = function() {
    this.searchTerm('');
    this.selectedZone(null);
    self.clearAllDetails();
  };

  // Select a Station
  this.selectStation = function(station) {
    // Move map to selected station
    map.setCenter(station.marker.position);

    // Clear all previous details
    self.clearAllDetails();

    // Show Station & Meetup info
    station.showInfoWindow();
    station.showNearbyMeetups();
  };

  // Clear all infoWindows and meetups
  this.clearAllDetails = function() {
    self.stationsList().forEach(function(station) {
      // Close station infoWindow
      station.infoWindow.close();
      // Close all nearby meetup Markers
      station.hideMeetupMarkers();
    });
  };

  // Hide markers when filtered out
  this.hideStationMarkers = function() {
    self.stationsList().forEach(function(station) {
      station.visible(false);
    });
  };

  // Zones
  this.zones = ko.observableArray([ 1, 2, 3, 4 ]);
  this.selectedZone = ko.observable();

  // Search Within Radius
  this.isSearchingWithinRadius = ko.observable(false);
  this.toggleSearchingWithinRadius = function() {
    let reverse = !this.isSearchingWithinRadius();
    self.isSearchingWithinRadius(reverse);
    if (!reverse) this.clearAllDetails();
  };

  this.shouldSearchWithinRadius = ko.observable(false);

  this.searchRadiusTime = ko.observable();
  this.searchRadiusMode = ko.observable('');
  this.searchRadiusAddress = ko.observable('');

  searchBox.addListener('places_changed', function() {
    let places = searchBox.getPlaces();
    if (places.length == 0) return;
    let place = places[0];
    let address = place.formatted_address
    self.searchRadiusAddress(address);
  });

  this.shouldDisplayMarkersWithinRadius = function(stationPosition, setMatchesDistance) {
    // Initialize GoogleMaps DistanceMatrix
    var distanceMatrixService = new google.maps.DistanceMatrixService;
    var address = this.searchRadiusAddress();
    
    // Use the distance matrix service to calculate the duration of the
    // routes between all our markers, and the destination address entered
    // by the user. Then put all the origins into an origin matrix.
    var mode = self.searchRadiusMode();
    var foundMatchingStations = false;

    distanceMatrixService.getDistanceMatrix({
      origins: [stationPosition],
      destinations: [address],
      travelMode: google.maps.TravelMode[mode],
      unitSystem: google.maps.UnitSystem.IMPERIAL,
    }, function(response, status) {
      if (status !== google.maps.DistanceMatrixStatus.OK) {
        window.alert('Error was: ' + status);
        foundMatchingStations = true;
      } else {
        // Success response
        foundMatchingStations = self.filterStationsWithinRadius(response);
      }
      setMatchesDistance(foundMatchingStations);
    });
  };

  this.filterStationsWithinRadius = function(response) {
    var maxDuration = self.searchRadiusTime();
    var origins = response.originAddresses;
    // Parse through the results, and get the distance and duration of each.
    // Because there might be  multiple origins and destinations we have a nested loop
    // Then, make sure at least 1 result was found.
    var atLeastOne = false;
    var bounds = new google.maps.LatLngBounds();
    for (var i = 0; i < origins.length; i++) {
      var results = response.rows[i].elements;
      results.forEach( function(element) {
        if (element.status === "OK") {
          // The distance is returned in feet, but the TEXT is in miles. If we wanted to switch
          // the function to show markers within a user-entered DISTANCE, we would need the
          // value for distance, but for now we only need the text.
          var distanceText = element.distance.text;
          // Duration value is given in seconds so we make it MINUTES. We need both the value
          // and the text.
          var duration = element.duration.value / 60;
          var durationText = element.duration.text;
          if (duration <= maxDuration) {
            atLeastOne = true;
            // Create a mini infowindow to open immediately and contain the
            // distance and duration
            let distance = `${durationText} away, ${distanceText}`
            self.stationsList()[i].distanceFromSearchAddress(distance);
          }
        }
      });
    }
    return atLeastOne;
  };

  // Searches for what user typed in the input bar using the locationlist array.
  // Only displaying the exact item results that user type if available in the locationlist array.
  this.filteredList = ko.computed( function() {
    var bounds = new google.maps.LatLngBounds();
    return ko.utils.arrayFilter(self.stationsList(), function(station) {
      // Hide all Meetup markers
      station.hideMeetupMarkers();
      
      // Default: show all stations
      var isInZone = true;
      var matchesSearchTerm = true;
      var matchesDistance = true;

      // Filter out by zone
      if (typeof self.selectedZone() === 'number') {
        isInZone = (self.selectedZone() == station.zoneId);
      }

      // Filter out by query string match
      var filter = self.searchTerm().toLowerCase();
      if (filter) {
        var string = station.name.toLowerCase();
        matchesSearchTerm = (string.search(filter) >= 0);
      }

      // Filter out by distance
      var setMatchesDistance = function (result) {
        console.log('matchesDistance1', result)
        matchesDistance = result;
      }
      if (self.isSearchingWithinRadius() && self.searchRadiusAddress() == '') {
        // Handle invalid input
        window.alert('You must enter an address.');
      } else if (self.isSearchingWithinRadius()) {
        self.shouldDisplayMarkersWithinRadius(station.marker.position, setMatchesDistance)
      }

      console.log('matchesDistance2', matchesDistance)
      // If user sets Zone && a string query, positive results should match both
      var shouldBeVisible = isInZone && matchesSearchTerm && matchesDistance;

      // Show/hide station
      station.visible(shouldBeVisible);

      // Expand the map to show the filtered Station
      if (shouldBeVisible) {
        bounds.extend(station.marker.position);
        map.fitBounds(bounds);
      }

      // Return result
      return shouldBeVisible;
    })
  }).extend({ rateLimit: 50 });
}

function onMapError() {
  $('#map').html("<div><h1>Failed to load Google Maps</h1></div>");
}

// Initialize the app with VM binding
function initApp() {
  ko.applyBindings(new ViewModel());
}
