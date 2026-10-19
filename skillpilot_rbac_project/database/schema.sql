-- SkillPilot: Role-Based Access Control (RBAC)
-- Run this file as a MySQL administrator. Tested design targets MySQL 8.0+.

CREATE DATABASE IF NOT EXISTS skillpilot_rbac
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE skillpilot_rbac;

CREATE TABLE IF NOT EXISTS departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL
);
CREATE TABLE IF NOT EXISTS role_permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role_id INT NOT NULL,
  resource VARCHAR(80) NOT NULL,
  can_read BOOLEAN NOT NULL DEFAULT FALSE,
  can_create BOOLEAN NOT NULL DEFAULT FALSE,
  can_update BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY uq_role_resource (role_id, resource),
  CONSTRAINT fk_permission_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  department_id INT NOT NULL,
  role_id INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_department FOREIGN KEY (department_id) REFERENCES departments(id),
  CONSTRAINT fk_user_role FOREIGN KEY (role_id) REFERENCES roles(id)
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  action VARCHAR(80) NOT NULL,
  detail VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_created (created_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT IGNORE INTO departments (name) VALUES
 ('Sales'), ('Human Resources'), ('IT'), ('Finance');

INSERT IGNORE INTO roles (name, description) VALUES
 ('Admin', 'Full application administration across departments'),
 ('Manager', 'Read and manage records in their own department'),
 ('Employee', 'Read permitted records in their own department'),
 ('HR Officer', 'Manage HR-related records');

INSERT IGNORE INTO role_permissions (role_id, resource, can_read, can_create, can_update, can_delete)
SELECT r.id, p.resource, p.can_read, p.can_create, p.can_update, p.can_delete
FROM roles r
JOIN (
  SELECT 'users' resource, 1 can_read, 1 can_create, 1 can_update, 1 can_delete, 'Admin' role_name
  UNION ALL SELECT 'departments',1,1,1,1,'Admin'
  UNION ALL SELECT 'role_permissions',1,1,1,1,'Admin'
  UNION ALL SELECT 'audit_logs',1,0,0,0,'Admin'
  UNION ALL SELECT 'users',1,1,1,0,'Manager'
  UNION ALL SELECT 'departments',1,0,0,0,'Manager'
  UNION ALL SELECT 'users',1,0,0,0,'Employee'
  UNION ALL SELECT 'departments',1,0,0,0,'Employee'
  UNION ALL SELECT 'users',1,1,1,0,'HR Officer'
  UNION ALL SELECT 'departments',1,0,0,0,'HR Officer'
) p ON p.role_name = r.name
ON DUPLICATE KEY UPDATE
 can_read=VALUES(can_read), can_create=VALUES(can_create),
 can_update=VALUES(can_update), can_delete=VALUES(can_delete);

-- Create a restricted MySQL account for the Node.js application.
-- Change the password before running. Run as a MySQL administrator.
CREATE USER IF NOT EXISTS 'rbac_app'@'localhost' IDENTIFIED BY 'change_this_password';
GRANT SELECT, INSERT, UPDATE, DELETE ON skillpilot_rbac.* TO 'rbac_app'@'localhost';
FLUSH PRIVILEGES;

-- Note: application role assignments are stored in roles/users and enforced by server.js.
-- MySQL-native roles can additionally be used for database-side access separation.
-- The following native roles are optional and illustrate MySQL role management:
CREATE ROLE IF NOT EXISTS 'sales_reader', 'hr_reader', 'finance_reader';
GRANT SELECT ON skillpilot_rbac.departments TO 'sales_reader', 'hr_reader', 'finance_reader';
GRANT SELECT ON skillpilot_rbac.role_permissions TO 'sales_reader', 'hr_reader', 'finance_reader';
-- Avoid granting broad table access to department roles. Add narrowly scoped views and
-- grants for production deployments, based on the actual data classification.
