import { describe, it, beforeEach, assertEquals, assertMatch, assertThrows, assert } from '../deps.ts';
import { Planet } from './sample_model.ts';

describe('model methods', () => {
  beforeEach(() => {
    Planet['sql'] = '';
  });

  describe('delete method', () => {
    it('appends appropriate query string to model when invoked without arguments', () => {
      const actualQuery = Planet.delete()['sql'];
      const expectedQuery = 'DELETE FROM planets';
      assertEquals(actualQuery, expectedQuery);
    });
  
    it('throws an error if invoked on a model with an already in-progress sql query', () => {
      Planet['sql'] = 'SELECT climate FROM planets';
      assertThrows(() => Planet.delete(), Error);
    });
  });

  describe('select method', () => {
    it('appends appropriate query string to model when invoked with an asterisk', () => {
      const actualQuery = Planet.select('*')['sql'];
      const expectedQuery = 'SELECT * FROM planets';
      assertEquals(actualQuery, expectedQuery);
    });
  
    it('appends appropriate query string to model when invoked with one valid column name', () => {
      const actualQuery = Planet.select('climate')['sql'];
      const expectedQuery = 'SELECT climate FROM planets';
      assertEquals(actualQuery, expectedQuery);
    });
  
    it('appends appropriate query string to model when invoked with multiple valid column names', () => {
      const actualQuery = Planet.select('climate', 'terrain')['sql'];
      const expectedQuery = /SELECT\s+climate,\s*terrain\s+FROM\s+planets/i; // ignore missing or extra spaces where inconsequential
      assertMatch(actualQuery, expectedQuery);
    });
  
    it('defaults to "SELECT *" when invoked without any arguments', () => {
      const actualQuery = Planet.select()['sql'];
      const expectedQuery = 'SELECT * FROM planets';
      assertEquals(actualQuery, expectedQuery);
    });
  
    it('throws an error if invoked with any invalid column names', () => {
      assertThrows(() => Planet.select('diaaameter'), Error);
    });
  
    it('throws an error if invoked on a model with an already in-progress sql query', () => {
      Planet['sql'] = 'SELECT climate FROM planets';
      assertThrows(() => Planet.select('terrain'), Error);
    });
  });
  
  describe('where method', () => {
    it('appends query beginning with "SELECT *" when not chained onto another method', () => {
      const actualQuery = Planet.where('climate = temperate')['sql'];
      assert(actualQuery.startsWith('SELECT * FROM planets'));
    });

    it('adds a space before the word "WHERE" when chained onto another method', () => {
      Planet['sql'] = 'SELECT * FROM planets';
      const actualQuery = Planet.where('climate = temperate')['sql'];
      assert(actualQuery.startsWith(`SELECT * FROM planets WHERE`));
    });

    it('adds appropriate query string to model when invoked with equality and comparison conditions', () => {
      const equalityQuery = Planet.where('climate = temperate')['sql'];
      assert(equalityQuery.includes(`climate = 'temperate'`));
      Planet['sql'] = '';

      const numComparisonQuery = Planet.where('rotation_period > 12')['sql'];
      assert(numComparisonQuery.includes(`rotation_period > '12'`));
      Planet['sql'] = '';

      const charComparisonQuery = Planet.where('name < Hoth')['sql'];
      assert(charComparisonQuery.includes(`name < 'Hoth'`));
      Planet['sql'] = '';

      const comparisonOrEqualityQuery = Planet.where('rotation_period >= 12')['sql'];
      assert(comparisonOrEqualityQuery.includes(`rotation_period >= '12'`));
    });

    it('adds appropriate query string to model when invoked with the LIKE operator', () => {
      const actualQuery = Planet.where('name LIKE A%')['sql'];
      assert(actualQuery.includes(`name LIKE 'A%'`));
    });

    it('adds appropriate query string to model when invoked with more than one condition', () => {
      const actualQuery = Planet.where('climate = temperate', 'rotation_period > 12')['sql'];
      const expectedQuery = `climate = 'temperate' rotation_period > '12'`;
      assert(actualQuery.includes(expectedQuery));
    });

    it('throws an error when invoked with column names not on the model', () => {
      assertThrows(() => Planet.where('rotationPeriod = 24'), Error);
    });
  });
});

