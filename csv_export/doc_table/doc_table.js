import { saveAs } from '@elastic/filesaver';
import _ from 'lodash';
import '../directives/infinite_scroll';
import '../directives/truncated';
import { uiModules } from '../modules';
import { dispatchRenderComplete } from '../render_complete';
import './components/table_header';
import './components/table_row';
import html from './doc_table.html';
import './doc_table.less';
import { getLimitedSearchResultsMessage } from './doc_table_strings';
import { getSort } from './lib/get_sort';

uiModules
  .get('kibana')
  .directive('docTable', function(
    config,
    Notifier,
    getAppState,
    pagerFactory,
    $filter,
    courier
  ) {
    return {
      restrict: 'E',
      template: html,
      scope: {
        sorting: '=',
        columns: '=',
        hits: '=?', // You really want either hits & indexPattern, OR searchSource
        indexPattern: '=?',
        searchSource: '=?',
        infiniteScroll: '=?',
        filter: '=?',
        filters: '=?',
        minimumVisibleRows: '=?',
        onAddColumn: '=?',
        onChangeSortOrder: '=?',
        onMoveColumn: '=?',
        onRemoveColumn: '=?'
      },
      link: function($scope, $el) {
        const notify = new Notifier();

        $scope.$watch('minimumVisibleRows', minimumVisibleRows => {
          $scope.limit = Math.max(minimumVisibleRows || 50, $scope.limit || 50);
        });

        $scope.persist = {
          sorting: $scope.sorting,
          columns: $scope.columns
        };

        const limitTo = $filter('limitTo');
        const calculateItemsOnPage = () => {
          $scope.pager.setTotalItems($scope.hits.length);
          $scope.pageOfItems = limitTo(
            $scope.hits,
            $scope.pager.pageSize,
            $scope.pager.startIndex
          );
        };

        $scope.limitedResultsWarning = getLimitedSearchResultsMessage(
          config.get('discover:sampleSize')
        );

        $scope.addRows = function() {
          $scope.limit += 50;
        };

        // This exists to fix the problem of an empty initial column list not playing nice with watchCollection.
        $scope.$watch('columns', function(columns) {
          if (columns.length !== 0) return;

          const $state = getAppState();
          $scope.columns.push('_source');
          if ($state) $state.replace();
        });

        $scope.$watchCollection('columns', function(columns, oldColumns) {
          if (
            oldColumns.length === 1 &&
            oldColumns[0] === '_source' &&
            $scope.columns.length > 1
          ) {
            _.pull($scope.columns, '_source');
          }

          if ($scope.columns.length === 0) $scope.columns.push('_source');
        });

        $scope.$watch('searchSource', function() {
          if (!$scope.searchSource) return;

          $scope.indexPattern = $scope.searchSource.get('index');

          $scope.searchSource.size(config.get('discover:sampleSize'));
          $scope.searchSource.sort(
            getSort($scope.sorting, $scope.indexPattern)
          );

          // Set the watcher after initialization
          $scope.$watchCollection('sorting', function(newSort, oldSort) {
            // Don't react if sort values didn't really change
            if (newSort === oldSort) return;
            $scope.searchSource.sort(getSort(newSort, $scope.indexPattern));
            $scope.searchSource.fetchQueued();
          });

          $scope.$on('$destroy', function() {
            if ($scope.searchSource) $scope.searchSource.destroy();
          });

          function onResults(resp) {
            // Reset infinite scroll limit
            $scope.limit = 50;

            // Abort if something changed
            if ($scope.searchSource !== $scope.searchSource) return;

            $scope.hits = resp.hits.hits;
            if ($scope.hits.length === 0) {
              dispatchRenderComplete($el[0]);
            }
            // We limit the number of returned results, but we want to show the actual number of hits, not
            // just how many we retrieved.
            $scope.totalHitCount = resp.hits.total;
            $scope.pager = pagerFactory.create($scope.hits.length, 50, 1);
            calculateItemsOnPage();

            return $scope.searchSource.onResults().then(onResults);
          }

          function startSearching() {
            $scope.searchSource
              .onResults()
              .then(onResults)
              .catch(error => {
                notify.error(error);
                startSearching();
              });
          }
          startSearching();
          courier.fetch();
        });

        $scope.pageOfItems = [];
        $scope.onPageNext = () => {
          $scope.pager.nextPage();
          calculateItemsOnPage();
        };

        $scope.onPagePrevious = () => {
          $scope.pager.previousPage();
          calculateItemsOnPage();
        };

        $scope.shouldShowLimitedResultsWarning = () =>
          !$scope.pager.hasNextPage &&
          $scope.pager.totalItems < $scope.totalHitCount;

        $scope.exportAsCsv = function(formatted) {
          var csv = {
            separator: config.get('csv:separator'),
            quoteValues: config.get('csv:quoteValues')
          };

          var rows = $scope.hits;
          var columns = $scope.columns;
          if ($scope.indexPattern.timeFieldName) {
            columns = [$scope.indexPattern.timeFieldName].concat(columns);
          }
          var nonAlphaNumRE = /[^a-zA-Z0-9]/;
          var allDoubleQuoteRE = /"/g;

          function escape(val) {
            if (_.isObject(val)) val = val.valueOf();
            val = String(val);
            if (csv.quoteValues && nonAlphaNumRE.test(val)) {
              val = '"' + val.replace(allDoubleQuoteRE, '""') + '"';
            }
            return val;
          }

          function formatField(value, name) {
            var field = $scope.indexPattern.fields.byName[name];
            if (!field) return value;
            var defaultFormat = fieldFormats.getDefaultType(field.type);
            var formatter =
              field && field.format ? field.format : defaultFormat;

            return formatter.convert(value);
          }

          function formatRow(row) {
            $scope.indexPattern.flattenHit(row);
            row.$$_formatted =
              row.$$_formatted || _.mapValues(row.$$_flattened, formatField);
            return row.$$_formatted;
          }

          // get column values for each row
          var csvRows = rows.map(function(row, i) {
            return columns.map(function(column, j) {
              var val;

              if (formatted) {
                val = (row.$$_formatted || formatRow(row))[column];
              } else {
                val = (row.$$_flattened || formatRow(row))[column];
              }

              val = val == null ? '' : val;

              return val;
            });
          });

          // escape each cell in each row
          csvRows = csvRows.map(function(row, i) {
            return row.map(escape);
          });

          // add the columns to the rows
          csvRows.unshift(columns.map(escape));

          var data = csvRows
            .map(function(row) {
              return row.join(csv.separator) + '\r\n';
            })
            .join('');

          saveAs(new Blob([data], { type: 'text/plain' }), 'export.csv');
        };
      }
    };
  });
