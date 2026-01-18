# CONTRACTS/data_contract.md
## Tabellen
users(id,email,password_hash,role,created_at)
jobs(id,title,state,created_at,updated_at)
job_events(id,job_id,type,text,ts)
audit_log(id,actor_user_id,action,payload,ts)
