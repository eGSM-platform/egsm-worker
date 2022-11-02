angular.module('appRoutes', []).config(
	['$routeProvider',
	'$locationProvider',
	function($routeProvider, $locationProvider) {

	$routeProvider
	
		.when('/', {
			templateUrl: 'views/home.html',
			controller: 'MainController'
		})

		.when('/process', {
			templateUrl: 'views/process.html',
			controller: 'ProcessController'
		})


		.when('/lifeCycle', {
			templateUrl: 'views/lifeCycle.html',
			controller: 'LifeCycleController'
		})

		.when('/log', {
			templateUrl: 'views/log.html',
			controller: 'LogController'
		})

		.when('/bpmn', {
			templateUrl: 'views/bpmn.html',
			controller: 'LogController'
		})

	$locationProvider.html5Mode(true);

}]);
