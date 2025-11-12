"""Database connection and query utilities."""

import sqlite3
from pathlib import Path
from typing import Optional
import pandas as pd


class Database:
    """Helper class for connecting to and querying the Crate SQLite database."""

    def __init__(self, db_path: Optional[str] = None):
        """Initialize database connection.

        Args:
            db_path: Path to the SQLite database. If None, uses default path.
        """
        if db_path is None:
            # Default to the database in the project root data directory
            db_path = Path(__file__).parent.parent.parent.parent / \
                "data" / "music_kb.sqlite"

        self.db_path = Path(db_path)
        if not self.db_path.exists():
            raise FileNotFoundError(f"Database not found at {self.db_path}")

        self.conn = sqlite3.connect(str(self.db_path))

    def query(self, sql: str, params: Optional[tuple] = None) -> pd.DataFrame:
        """Execute a SQL query and return results as a DataFrame.

        Args:
            sql: SQL query string
            params: Optional tuple of parameters for parameterized queries

        Returns:
            pandas DataFrame with query results
        """
        if params:
            return pd.read_sql_query(sql, self.conn, params=params)
        return pd.read_sql_query(sql, self.conn)

    def get_tables(self) -> pd.DataFrame:
        """Get list of all tables in the database."""
        return self.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")

    def get_table_info(self, table_name: str) -> pd.DataFrame:
        """Get column information for a specific table.

        Args:
            table_name: Name of the table to inspect

        Returns:
            DataFrame with column definitions
        """
        return self.query(f"PRAGMA table_info({table_name})")

    def get_table_sample(self, table_name: str, limit: int = 5) -> pd.DataFrame:
        """Get a sample of rows from a table.

        Args:
            table_name: Name of the table
            limit: Number of rows to return (default 5)

        Returns:
            DataFrame with sample rows
        """
        return self.query(f"SELECT * FROM {table_name} LIMIT ?", (limit,))

    def get_row_count(self, table_name: str) -> int:
        """Get the number of rows in a table.

        Args:
            table_name: Name of the table

        Returns:
            Number of rows
        """
        result = self.query(f"SELECT COUNT(*) as count FROM {table_name}")
        return int(result['count'].iloc[0])

    def close(self):
        """Close the database connection."""
        if self.conn:
            self.conn.close()

    def __enter__(self):
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()


def get_connection(db_path: Optional[str] = None) -> Database:
    """Get a database connection.

    Args:
        db_path: Optional path to database file

    Returns:
        Database connection object
    """
    return Database(db_path)
